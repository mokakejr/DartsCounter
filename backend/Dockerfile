FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.11 /uv /uvx /usr/local/bin/

WORKDIR /app

# UV_COMPILE_BYTECODE_TIMEOUT=0 désactive le garde-fou de 60s qu'uv applique au
# démarrage du sous-process Python de compilation bytecode. Sur le VPS, les trois
# images se construisent en parallèle et ce démarrage dépasse la minute sous la
# charge — uv abandonne alors le build ("Python startup timed out (60s)") alors
# que rien n'est cassé, juste lent. Le garde-fou existe pour détecter un `python`
# réellement HS ; ici c'est un faux positif.
ENV UV_COMPILE_BYTECODE=1 \
    UV_COMPILE_BYTECODE_TIMEOUT=0 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY . .
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
