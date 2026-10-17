# photo-processor: ComfyUI with the ComfyUI-RMBG nodes, the processor of type
# photos (src/lib/server/photos). Built for an old NVIDIA card (GTX 1050 Ti,
# Pascal, 4 GB): PyTorch of the CUDA 12.6 line (later lines dropped Pascal) and
# BiRefNet patched to FP32 (FP16 is ~64 times slower on Pascal). Model weights
# are downloaded on first use into /comfy/models, a volume. No GPU: run with --cpu.
# See README, «Обработка фото».

FROM python:3.12-slim-bookworm

ARG COMFYUI_VERSION=v0.41.2
ARG RMBG_COMMIT=229529e0ea63fb7085848225d74f91f6dc164956
ARG TORCH_INDEX=https://download.pytorch.org/whl/cu126
ARG TORCH_VERSION=2.9.1
ARG TORCHVISION_VERSION=0.24.1

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install torch==${TORCH_VERSION} torchvision==${TORCHVISION_VERSION} --index-url ${TORCH_INDEX}

WORKDIR /comfy
RUN git clone --depth 1 --branch ${COMFYUI_VERSION} https://github.com/comfyanonymous/ComfyUI.git . \
    && pip install -r requirements.txt

# Only the BiRefNet node of the pack is used. Its other nodes (SAM, GroundingDINO…)
# need heavy packages, and the pack's loader gives up on the whole pack at the first
# module that fails to import, so every module but BiRefNet and its utils is removed.
RUN git clone https://github.com/1038lab/ComfyUI-RMBG.git custom_nodes/ComfyUI-RMBG \
    && git -C custom_nodes/ComfyUI-RMBG checkout ${RMBG_COMMIT} \
    && find custom_nodes/ComfyUI-RMBG/py -name '*.py' \
        ! -name AILab_BiRefNet.py ! -name AILab_utils.py -delete \
    && pip install huggingface-hub timm kornia einops opencv-python-headless
COPY patch-rmbg.py /tmp/patch-rmbg.py
RUN python /tmp/patch-rmbg.py custom_nodes/ComfyUI-RMBG/py/AILab_BiRefNet.py

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

# Side of the square BiRefNet sees, px: 832 fits a 4 GB card in FP32.
ENV BIREFNET_RESOLUTION=832
VOLUME /comfy/models
EXPOSE 8188
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8188/api/system_stats')"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["--force-fp32"]
