# Stage 1: Builder
FROM python:3.9-alpine AS builder

WORKDIR /build

# Cài đặt các gói cần thiết để build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    postgresql-dev

COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.9-alpine

WORKDIR /app

# Cài đặt các gói runtime cần thiết
RUN apk add --no-cache libpq

# Copy dependencies từ builder stage
COPY --from=builder /root/.local /root/.local

# Copy mã nguồn ứng dụng
COPY app.py .

# Thiết lập PATH để Python nhận các thư viện đã cài
ENV PATH="/root/.local/bin:${PATH}"
ENV PYTHONPATH="/root/.local/lib/python3.9/site-packages:${PYTHONPATH}"

EXPOSE 5000
CMD ["python", "app.py"]
