/**
 * The project board workflow: which column each label and pull request goes to,
 * which issues a description closes, and that the workflow stays out of the public repo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const board = require(join(REPO_ROOT, ".github", "scripts", "project-board.cjs"));

const COLUMNS = ["Inbox", "Todo", "Awaiting approval", "In progress", "In review", "Done"];

/** A fake GitHub client: a board with the six columns; records label removals and status sets. */
function fakeGithub(issues: Record<number, { node_id: string; state: string; labels: string[]; pull_request?: object }> = {}) {
  const status = new Map<string, string>(); // item id → column
  const removed: string[] = [];
  const optionName = (id: string) => COLUMNS[Number(id.slice(4))];
  const github = {
    graphql: async (query: string, vars: Record<string, string>) => {
      if (query.includes("projectV2(number")) {
        return { user: { projectV2: { id: "P1", field: { id: "F1", options: COLUMNS.map((name, i) => ({ id: `opt-${i}`, name })) } } } };
      }
      if (query.includes("addProjectV2ItemById")) return { addProjectV2ItemById: { item: { id: `item-${vars.content}` } } };
      if (query.includes("updateProjectV2ItemFieldValue")) {
        status.set(vars.item, optionName(vars.option));
        return {};
      }
      if (query.includes("fieldValueByName")) return { node: { fieldValueByName: { name: status.get(vars.item) } } };
      throw new Error("unexpected query");
    },
    rest: {
      issues: {
        removeLabel: async ({ issue_number, name }: { issue_number: number; name: string }) => {
          removed.push(`#${issue_number} ${name}`);
        },
        get: async ({ issue_number }: { issue_number: number }) => {
          const i = issues[issue_number];
          if (!i) throw new Error("Not Found");
          return { data: { number: issue_number, ...i, labels: i.labels.map((name) => ({ name })) } };
        },
      },
    },
  };
  return { github, status, removed };
}

const core = { info() {}, warning() {} };
const repo = { owner: "owner", repo: "repo" };
const noWait = async () => {};

test("a status label moves the issue and drops the other status labels", async () => {
  const { github, status, removed } = fakeGithub();
  await board.run({
    github, core, projectNumber: 1, wait: noWait,
    context: {
      eventName: "issues", repo,
      payload: {
        label: { name: "status: in progress" },
        issue: { number: 7, node_id: "I7", state: "open", labels: [{ name: "status: todo" }, { name: "status: in progress" }, { name: "engine" }] },
      },
    },
  });
  assert.equal(status.get("item-I7"), "In progress");
  assert.deepEqual(removed, ["#7 status: todo"]);
});

test("other labels and closed issues leave the board alone", async () => {
  const { github, status } = fakeGithub();
  const issue = { number: 7, node_id: "I7", state: "open", labels: [] };
  await board.run({ github, core, projectNumber: 1, wait: noWait, context: { eventName: "issues", repo, payload: { label: { name: "bug" }, issue } } });
  await board.run({
    github, core, projectNumber: 1, wait: noWait,
    context: { eventName: "issues", repo, payload: { label: { name: "status: todo" }, issue: { ...issue, state: "closed" } } },
  });
  assert.equal(status.size, 0);
});

test("a pull request and the issues it closes go to In review; a draft to In progress", async () => {
  const issues = {
    3: { node_id: "I3", state: "open", labels: ["status: in progress"] },
    4: { node_id: "I4", state: "closed", labels: [] },
    5: { node_id: "PR5", state: "open", labels: [], pull_request: {} },
  };
  const { github, status, removed } = fakeGithub(issues);
  const pr = { number: 9, node_id: "PR9", state: "open", draft: false, body: "Closes #3, fixes #4 and resolves #5. Also #6." };
  await board.run({ github, core, projectNumber: 1, wait: noWait, context: { eventName: "pull_request", repo, payload: { action: "opened", pull_request: pr } } });
  assert.equal(status.get("item-PR9"), "In review");
  assert.equal(status.get("item-I3"), "In review");
  assert.ok(!status.has("item-I4"), "closed issue untouched");
  assert.ok(!status.has("item-PR5"), "a linked pull request isn't an issue");
  assert.deepEqual(removed, ["#3 status: in progress"]);

  await board.run({
    github, core, projectNumber: 1, wait: noWait,
    context: { eventName: "pull_request", repo, payload: { action: "converted_to_draft", pull_request: { ...pr, draft: true } } },
  });
  assert.equal(status.get("item-PR9"), "In progress");
  assert.equal(status.get("item-I3"), "In progress");
});

test("editing a pull request's title only does nothing", async () => {
  const { github, status } = fakeGithub();
  const pr = { number: 9, node_id: "PR9", state: "open", draft: false, body: "" };
  await board.run({
    github, core, projectNumber: 1, wait: noWait,
    context: { eventName: "pull_request", repo, payload: { action: "edited", changes: { title: { from: "x" } }, pull_request: pr } },
  });
  assert.equal(status.size, 0);
});

test("a status the board doesn't have fails with the columns it has", async () => {
  const { github } = fakeGithub();
  const g = { ...github, graphql: async (q: string, v: Record<string, string>) => {
    if (q.includes("projectV2(number")) return { user: { projectV2: { id: "P1", field: { id: "F1", options: [{ id: "a", name: "Todo" }] } } } };
    return github.graphql(q, v);
  } };
  await assert.rejects(
    board.run({ github: g, core, projectNumber: 1, wait: noWait, context: { eventName: "issues", repo, payload: { label: { name: "status: in progress" }, issue: { number: 1, node_id: "I1", state: "open", labels: [] } } } }),
    /Status "In progress" isn't a column on the board \(has: Todo\)/,
  );
});

test("a manual run places open issues by their status label and open pull requests by draft state", async () => {
  const { github, status } = fakeGithub();
  const listed = [
    { number: 1, node_id: "I1", labels: [{ name: "engine" }, { name: "status: awaiting approval" }] },
    { number: 2, node_id: "I2", labels: [{ name: "ui" }] },
    { number: 3, node_id: "PR3", labels: [], pull_request: {} },
    { number: 4, node_id: "PR4", labels: [], pull_request: {} },
  ];
  const g = {
    ...github,
    paginate: async () => listed,
    rest: {
      ...github.rest,
      issues: { ...github.rest.issues, listForRepo: async () => ({ data: listed }) },
      pulls: { get: async ({ pull_number }: { pull_number: number }) => ({ data: { number: pull_number, draft: pull_number === 4 } }) },
    },
  };
  await board.run({ github: g, core, projectNumber: 1, wait: noWait, context: { eventName: "workflow_dispatch", repo, payload: {} } });
  assert.equal(status.get("item-I1"), "Awaiting approval");
  assert.ok(!status.has("item-I2"), "no status label: left where it is");
  assert.equal(status.get("item-PR3"), "In review");
  assert.equal(status.get("item-PR4"), "In progress");
});

test("closing keywords", () => {
  assert.deepEqual(board.closedIssues("Closes #12\nFixes: #13, resolved #12, fix #14 and #15"), [12, 13, 14]);
  assert.deepEqual(board.closedIssues(null), []);
  assert.deepEqual(board.closedIssues("See #12; closing soon"), []);
});

test("the board workflow runs in the private repo only and names no accounts", () => {
  const wf = readFileSync(join(REPO_ROOT, ".github", "workflows", "project-board.yml"), "utf8");
  assert.ok(wf.includes("github.event.repository.private == true &&"), "private repo only");
  assert.ok(wf.includes("startsWith(github.event.label.name, 'status: ')"), "other labels never take a runner");
  assert.match(wf, /\n    concurrency:\n/, "concurrency on the job, so skipped label runs don't cancel status runs");
  assert.ok(wf.includes("workflow_dispatch:"));
  assert.doesNotMatch(wf, /actions\/checkout/, "no checkout: it would change the runners' shared workspace");
  assert.ok(wf.includes("${{ secrets.PROJECT_TOKEN }}"));
  const script = readFileSync(join(REPO_ROOT, ".github", "scripts", "project-board.cjs"), "utf8");
  for (const s of [wf, script]) assert.doesNotMatch(s, /daliusiv|speaker-box-genius|workers\.dev/);
});
