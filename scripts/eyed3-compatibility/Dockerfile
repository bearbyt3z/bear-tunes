ARG PYTHON_VERSION=3.10.18

FROM python:${PYTHON_VERSION}-slim-bookworm

ARG EYED3_TARGET=project

RUN apt-get update \
  && apt-get install -y --no-install-recommends lame \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /opt/eyed3-compatibility/requirements.txt

RUN case "${EYED3_TARGET}" in \
      project) \
        python -m pip install \
          --disable-pip-version-check \
          --no-cache-dir \
          --root-user-action=ignore \
          -r /opt/eyed3-compatibility/requirements.txt \
        ;; \
      latest) \
        python -m pip install \
          --disable-pip-version-check \
          --no-cache-dir \
          --root-user-action=ignore \
          eyeD3 \
        ;; \
      *) \
        python -m pip install \
          --disable-pip-version-check \
          --no-cache-dir \
          --root-user-action=ignore \
          "eyeD3==${EYED3_TARGET}" \
        ;; \
    esac

COPY scripts/eyed3-compatibility/test_display_plugin_replacement.py /opt/eyed3-compatibility/test_display_plugin_replacement.py

WORKDIR /work

ENTRYPOINT ["python", "/opt/eyed3-compatibility/test_display_plugin_replacement.py"]
