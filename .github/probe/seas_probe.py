"""One-off probe of seas.no (SEAS gave permission on 9 Nov 2026 to use the T/S
parameters from their datasheets). Saves robots.txt, a polite sample of pages
and a few datasheets so the importer can be written against real markup.
Honours robots.txt for our user agent and waits between requests."""
import hashlib, json, os, re, time, urllib.parse, urllib.request, urllib.robotparser
from html.parser import HTMLParser

UA = "SpeakerBoxGenius-importer/1.0 (+https://speakerboxgenius.com; data use permitted by SEAS)"
BASE = "https://www.seas.no/"
OUT = "probe-out"
MAX_PAGES, MAX_PDFS, DELAY = 60, 6, 1.5
os.makedirs(f"{OUT}/pages", exist_ok=True); os.makedirs(f"{OUT}/pdfs", exist_ok=True)
log = []

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read(), r.geturl()

status, _, body, _ = get(BASE + "robots.txt")
open(f"{OUT}/robots.txt", "wb").write(body)
rp = urllib.robotparser.RobotFileParser(); rp.parse(body.decode("utf-8", "replace").splitlines())
allowed_home = rp.can_fetch(UA, BASE)
log.append({"robots_status": status, "allowed_home_for_our_ua": allowed_home, "allowed_home_for_star": rp.can_fetch("*", BASE)})

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v: self.links.append(v)

def score(u):
    s = u.lower()
    return -sum(w in s for w in ("product", "prestige", "excel", "woofer", "midrange", "full", "coax", "exotic", "itemid", "view=")) 

if allowed_home:
    queue, seen, pdfs, pages = [BASE], set(), [], []
    while queue and len(pages) < MAX_PAGES:
        queue.sort(key=score)
        url = queue.pop(0)
        if url in seen: continue
        seen.add(url)
        if not rp.can_fetch(UA, url):
            log.append({"skipped_by_robots": url}); continue
        try:
            st, ct, data, final = get(url)
        except Exception as e:
            log.append({"error": url, "msg": str(e)}); continue
        time.sleep(DELAY)
        if "html" not in ct: continue
        name = hashlib.sha1(url.encode()).hexdigest()[:12] + ".html"
        open(f"{OUT}/pages/{name}", "wb").write(data)
        pages.append({"url": url, "file": name, "status": st})
        p = Links(); p.feed(data.decode("utf-8", "replace"))
        for h in p.links:
            u = urllib.parse.urljoin(final, h).split("#")[0]
            if urllib.parse.urlparse(u).netloc not in ("www.seas.no", "seas.no"): continue
            if u.lower().endswith(".pdf"):
                if u not in pdfs: pdfs.append(u)
            elif u not in seen and not re.search(r"\.(jpg|jpeg|png|gif|zip|dxf|stp|step)$", u, re.I):
                queue.append(u)
    for u in pdfs[:MAX_PDFS]:
        if not rp.can_fetch(UA, u):
            log.append({"skipped_by_robots": u}); continue
        try:
            st, ct, data, _ = get(u)
            open(f"{OUT}/pdfs/" + urllib.parse.unquote(u.rsplit("/", 1)[1]), "wb").write(data)
        except Exception as e:
            log.append({"error": u, "msg": str(e)})
        time.sleep(DELAY)
    json.dump({"pages": pages, "pdf_links": pdfs, "log": log}, open(f"{OUT}/index.json", "w"), indent=1)
else:
    json.dump({"pages": [], "pdf_links": [], "log": log}, open(f"{OUT}/index.json", "w"), indent=1)
print(json.dumps(log, indent=1))
