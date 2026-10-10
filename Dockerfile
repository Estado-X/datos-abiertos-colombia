FROM astral/uv:python3.14-trixie-slim

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ADD . /app/
RUN uv sync --frozen

# Puerto HTTP (8000 por defecto, se cambia con MCP_PORT)
EXPOSE 8000

ENTRYPOINT ["uv", "run"]
CMD ["datos-abiertos-colombia", "--http", "--host", "0.0.0.0"]
