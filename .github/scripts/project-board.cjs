// Keeps the maintainer's project board in step with issue labels and pull requests.
// Run by .github/workflows/project-board.yml through actions/github-script.
//
// Status columns: Inbox, Todo, Awaiting approval, In progress, In review, Done.
// The board's own workflows put new items in Inbox and closed or merged ones in Done;
// this script moves everything in between:
//   - a "status: …" label on an open issue moves it to that column (one status label at a time);
//   - a draft pull request is In progress, an open one In review, and so are the issues
//     its description closes ("Closes #12", "Fixes #12", "Resolves #12");
//   - run by hand (workflow_dispatch), it places every open issue with a status label and
//     every open pull request.

const STATUS_LABELS = {
  "status: todo": "Todo",
  "status: awaiting approval": "Awaiting approval",
  "status: in progress": "In progress",
};

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

/** Issue numbers a pull request description closes, in order, without repeats. */
function closedIssues(body) {
  const out = [];
  for (const m of (body || "").matchAll(CLOSING)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** The column a pull request belongs in. */
function prStatus(pr) {
  return pr.draft ? "In progress" : "In review";
}

const PROJECT_QUERY = `query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
    }
  }
}`;

const ADD_ITEM = `mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`;

const SET_STATUS = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option }
  }) { projectV2Item { id } }
}`;

const ITEM_STATUS = `query($item: ID!) {
  node(id: $item) {
    ... on ProjectV2Item { fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } }
  }
}`;

async function loadBoard(github, owner, number) {
  const res = await github.graphql(PROJECT_QUERY, { owner, number });
  const project = res.user && res.user.projectV2;
  if (!project) throw new Error(`Project ${number} not found for ${owner} (check PROJECT_TOKEN has the project scope).`);
  if (!project.field || !project.field.options) throw new Error(`Project ${number} has no single-select Status field.`);
  return { id: project.id, field: project.field.id, options: project.field.options };
}

function optionId(board, name) {
  const opt = board.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (!opt) {
    throw new Error(`Status "${name}" isn't a column on the board (has: ${board.options.map((o) => o.name).join(", ")}).`);
  }
  return opt.id;
}

/**
 * Puts an issue or pull request (by node id) in a column. The board's "item added"
 * workflow can land a moment after the item is added and reset it to Inbox, so the
 * status is read back once and set again if it changed.
 */
async function setStatus(github, board, contentId, name, wait) {
  const option = optionId(board, name);
  const added = await github.graphql(ADD_ITEM, { project: board.id, content: contentId });
  const item = added.addProjectV2ItemById.item.id;
  const vars = { project: board.id, item, field: board.field, option };
  await github.graphql(SET_STATUS, vars);
  await wait(5000);
  const now = await github.graphql(ITEM_STATUS, { item });
  const value = now.node && now.node.fieldValueByName;
  if (!value || value.name !== name) await github.graphql(SET_STATUS, vars);
}

/** Removes every status label but `keep` from an issue. */
async function dropStatusLabels(github, repo, issue, keep) {
  for (const label of issue.labels || []) {
    const name = typeof label === "string" ? label : label.name;
    if (name !== keep && STATUS_LABELS[name]) {
      await github.rest.issues.removeLabel({ ...repo, issue_number: issue.number, name });
    }
  }
}

/** The column an issue's labels put it in, or null when it has no status label. */
function labelStatus(labels) {
  for (const label of labels || []) {
    const name = typeof label === "string" ? label : label.name;
    if (STATUS_LABELS[name]) return STATUS_LABELS[name];
  }
  return null;
}

/**
 * Puts every open issue with a status label and every open pull request in its column
 * (run by hand: after a bulk import, or to add items that predate the board).
 */
async function syncAll({ github, context, core, projectNumber }) {
  const repo = context.repo;
  const board = await loadBoard(github, repo.owner, projectNumber);
  const items = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: "open", per_page: 100 });
  const noWait = async () => {};
  let moved = 0;
  for (const it of items) {
    let status;
    if (it.pull_request) {
      const pr = (await github.rest.pulls.get({ ...repo, pull_number: it.number })).data;
      status = prStatus(pr);
    } else {
      status = labelStatus(it.labels);
    }
    if (!status) continue;
    await setStatus(github, board, it.node_id, status, noWait);
    moved++;
  }
  core.info(`${moved} of ${items.length} open items placed.`);
}

async function run({ github, context, core, projectNumber, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const repo = context.repo;
  const owner = context.repo.owner;
  const p = context.payload;

  if (context.eventName === "workflow_dispatch") {
    await syncAll({ github, context, core, projectNumber });
    return;
  }

  if (context.eventName === "issues") {
    const name = p.label && p.label.name;
    const status = STATUS_LABELS[name];
    if (!status || p.issue.state !== "open") return;
    await dropStatusLabels(github, repo, p.issue, name);
    const board = await loadBoard(github, owner, projectNumber);
    await setStatus(github, board, p.issue.node_id, status, wait);
    core.info(`#${p.issue.number} → ${status}`);
    return;
  }

  if (context.eventName === "pull_request") {
    const pr = p.pull_request;
    if (pr.state !== "open") return;
    if (p.action === "edited" && !(p.changes && p.changes.body)) return;
    const status = prStatus(pr);
    const board = await loadBoard(github, owner, projectNumber);
    await setStatus(github, board, pr.node_id, status, wait);
    core.info(`PR #${pr.number} → ${status}`);
    for (const n of closedIssues(pr.body)) {
      let issue;
      try {
        issue = (await github.rest.issues.get({ ...repo, issue_number: n })).data;
      } catch {
        core.warning(`#${n} isn't an issue in this repo; skipped.`);
        continue;
      }
      if (issue.pull_request || issue.state !== "open") continue;
      await dropStatusLabels(github, repo, issue, null);
      await setStatus(github, board, issue.node_id, status, wait);
      core.info(`#${n} → ${status} (closed by PR #${pr.number})`);
    }
  }
}

module.exports = { run, closedIssues, prStatus, labelStatus, STATUS_LABELS };
