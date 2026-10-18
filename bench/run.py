"""Runs each compared model on each photo in ComfyUI (CPU) and saves the cutouts
to bench/results/<photo>-<model>.png, with timings in bench/results/log.txt."""

import json, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
COMFY = ROOT.parent / "comfy"
RESULTS = ROOT / "results"
URL = "http://127.0.0.1:8188"

COMMON = {"sensitivity": 1.0, "mask_blur": 0, "mask_offset": 0, "invert_output": False,
          "background": "Alpha", "background_color": "#222222", "unload_model": True}


def birefnet(image, model):
    return {"class_type": "BiRefNetRMBG", "inputs": {"image": image, "model": model,
            "refine_foreground": True, **COMMON}}


def rmbg(image, model):
    return {"class_type": "RMBG", "inputs": {"image": image, "model": model, "process_res": 1024,
            "refine_foreground": True, **COMMON}}


def sdmatte(image, mask, transparent):
    return {"class_type": "AILab_SDMatte", "inputs": {
        "image": image, "mask": mask, "model": "SDMatte", "device": "CPU", "process_res": 1024,
        "transparent_object": transparent, "mask_refine": True, **{**COMMON, "sensitivity": 0.9}}}


# name → nodes after LoadImage ("1"); the node named "out" is saved.
# SDMatte takes about 80 minutes a photo on the runner's CPU: one variant per photo.
VARIANTS = {
    "box": {"sdmatte-transparent": lambda: {"m": birefnet(["1", 0], "BiRefNet_dynamic"),
                                            "out": sdmatte(["1", 0], ["m", 1], True)}},
    "mug": {"sdmatte": lambda: {"m": birefnet(["1", 0], "BiRefNet_dynamic"),
                                "out": sdmatte(["1", 0], ["m", 1], False)}},
}


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data, {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    RESULTS.mkdir(exist_ok=True)
    (COMFY / "input").mkdir(exist_ok=True)
    for photo in (ROOT / "photos").iterdir():
        shutil.copy(photo, COMFY / "input" / photo.name)
    server = subprocess.Popen([sys.executable, "main.py", "--cpu", "--port", "8188"], cwd=COMFY)
    for _ in range(120):
        try:
            call("/api/system_stats")
            break
        except Exception:
            time.sleep(2)
    log = open(RESULTS / "log.txt", "a")
    failed = 0
    for photo in sorted((ROOT / "photos").iterdir()):
        for name, nodes in VARIANTS.get(photo.stem, {}).items():
            graph = {"1": {"class_type": "LoadImage", "inputs": {"image": photo.name}}}
            graph.update(nodes())
            prefix = f"{photo.stem}-{name}"
            graph["save"] = {"class_type": "SaveImage", "inputs": {"images": ["out", 0], "filename_prefix": prefix}}
            started = time.time()
            try:
                pid = call("/api/prompt", {"prompt": graph})["prompt_id"]
                while True:
                    entry = call(f"/api/history/{pid}").get(pid)
                    if entry and (entry["status"].get("completed") or entry["status"].get("status_str") == "error"):
                        break
                    if time.time() - started > 150 * 60:
                        call("/api/interrupt", {})
                        raise TimeoutError("over 150 minutes")
                    time.sleep(5)
                if entry["status"].get("status_str") == "error":
                    raise RuntimeError(json.dumps(entry["status"].get("messages"))[-2000:])
                file = entry["outputs"]["save"]["images"][0]["filename"]
                shutil.copy(COMFY / "output" / file, RESULTS / f"{prefix}.png")
                line = f"{prefix}: {time.time() - started:.0f} s"
            except Exception as e:
                failed += 1
                line = f"{prefix}: FAILED after {time.time() - started:.0f} s: {e}"
            print(line, flush=True)
            log.write(line + "\n")
            log.flush()
    server.terminate()
    sys.exit(1 if failed else 0)


main()
