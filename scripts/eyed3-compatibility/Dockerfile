FROM python:3.7.17-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends lame \
  && rm -rf /var/lib/apt/lists/*

RUN python -m pip install \
  --disable-pip-version-check \
  --no-cache-dir \
  --root-user-action=ignore \
  "eyeD3==0.9.7"

COPY test.py /opt/eyed3-compatibility/test.py

WORKDIR /work

ENTRYPOINT ["python", "/opt/eyed3-compatibility/test.py"]
