#!/usr/bin/env python3
"""Minimal fal.ai queue client: submit a job, poll, download the result images."""
import base64
import json
import os
import sys
import time
import urllib.request

KEY = os.environ["FAL_KEY"]
HDR = {"Authorization": f"Key {KEY}", "Content-Type": "application/json"}


def _req(url, data=None, method=None):
    r = urllib.request.Request(url, data=data, headers=HDR, method=method)
    with urllib.request.urlopen(r, timeout=180) as f:
        return json.loads(f.read().decode())


def data_uri(path):
    return "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode()


def run(model, payload, out_prefix, timeout=420):
    body = json.dumps(payload).encode()
    try:
        sub = _req(f"https://queue.fal.run/{model}", body)
    except urllib.error.HTTPError as e:
        print("SUBMIT ERROR", e.code, e.read().decode()[:1500])
        return None
    rid = sub["request_id"]
    base = sub.get("status_url", "").rsplit("/status", 1)[0]
    print(f"[{model}] queued {rid}")
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = _req(f"{base}/status")
        if st["status"] == "COMPLETED":
            break
        if st["status"] in ("FAILED", "ERROR"):
            print("FAILED", json.dumps(st)[:1200])
            return None
        time.sleep(3)
    else:
        print("TIMEOUT")
        return None
    res = _req(base)
    files = []
    imgs = res.get("images") or ([res["image"]] if res.get("image") else [])
    for i, im in enumerate(imgs):
        url = im["url"] if isinstance(im, dict) else im
        if url.startswith("data:"):
            raw = base64.b64decode(url.split(",", 1)[1])
        else:
            rq = urllib.request.Request(url, headers={"User-Agent": "fal-client"})
            raw = urllib.request.urlopen(rq, timeout=120).read()
        p = f"{out_prefix}_{i}.png"
        open(p, "wb").write(raw)
        files.append(p)
        print("  saved", p, len(raw) // 1024, "KB")
    print("  elapsed", round(time.time() - t0, 1), "s")
    return files


if __name__ == "__main__":
    print(json.dumps(_req("https://rest.alpha.fal.ai/tokens/", b"{}"))[:200]
          if "--auth" in sys.argv else "ok")
