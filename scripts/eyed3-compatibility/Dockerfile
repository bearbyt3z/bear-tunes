ARG PYTHON_VERSION=3.10.18

FROM node:22.13.0-bookworm-slim AS node

FROM python:${PYTHON_VERSION}-slim-bookworm

ARG REQUIREMENTS_FILE=python-requirements.txt
ARG PYTHON_VENV_DIRECTORY

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    lame \
    libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

ENV PATH="/work/${PYTHON_VENV_DIRECTORY}/bin:${PATH}"

RUN test -n "${PYTHON_VENV_DIRECTORY}"

COPY package.json package-lock.json ./
COPY src/config.mjs ./src/config.mjs
COPY python-requirements.txt python-requirements-minimal.txt python-requirements-latest.txt ./
COPY scripts/setup.mjs ./scripts/setup.mjs
COPY eyed3-display-plugin-replacement.py ./eyed3-display-plugin-replacement.py
COPY eyed3-display-plugin-pattern.txt ./eyed3-display-plugin-pattern.txt
COPY scripts/eyed3-compatibility ./scripts/eyed3-compatibility

RUN npm ci

RUN npm run setup -- "${REQUIREMENTS_FILE}"

ENTRYPOINT ["python", "scripts/eyed3-compatibility/run_tests.py"]
