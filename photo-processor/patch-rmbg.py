"""Patches the BiRefNet node of ComfyUI-RMBG for old NVIDIA cards.

- FP32 instead of FP16: Pascal (GTX 10xx) computes FP16 about 64 times slower.
- BiRefNet_dynamic runs at BIREFNET_RESOLUTION (an environment variable read
  when the node runs) instead of 1024: in FP32 1024 needs about 4.8 GB.

Fails when the code it patches has changed, so an update of the pinned commit
cannot silently drop the patch.
"""

import sys

path = sys.argv[1]
source = open(path, encoding="utf-8").read()

replacements = [
    ("self.model.half()", "self.model.float()"),
    (".unsqueeze(0).to(device).half()", ".unsqueeze(0).to(device).float()"),
    (
        'process_res = model_config.get("default_res", 1024)',
        'process_res = int(os.environ.get("BIREFNET_RESOLUTION", 0)) if model == "BiRefNet_dynamic" '
        'and os.environ.get("BIREFNET_RESOLUTION") else model_config.get("default_res", 1024)',
    ),
]
for old, new in replacements:
    if source.count(old) != 1:
        sys.exit(f"patch-rmbg: expected exactly one {old!r} in {path}")
    source = source.replace(old, new)

open(path, "w", encoding="utf-8").write(source)
print(f"patch-rmbg: patched {path}")
