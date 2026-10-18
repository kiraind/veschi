#!/bin/sh
set -eux
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
git clone --depth 1 --branch v0.41.2 https://github.com/comfyanonymous/ComfyUI.git comfy
pip install -r comfy/requirements.txt
git clone https://github.com/1038lab/ComfyUI-RMBG.git comfy/custom_nodes/ComfyUI-RMBG
git -C comfy/custom_nodes/ComfyUI-RMBG checkout 229529e0ea63fb7085848225d74f91f6dc164956
# The pack gives up on itself at the first module that fails to import: keep only the ones compared.
find comfy/custom_nodes/ComfyUI-RMBG/py -name '*.py' ! -name AILab_BiRefNet.py ! -name AILab_RMBG.py \
	! -name AILab_SDMatte.py ! -name AILab_utils.py -delete
pip install huggingface-hub timm kornia einops opencv-python-headless transformers diffusers \
	transparent-background safetensors
