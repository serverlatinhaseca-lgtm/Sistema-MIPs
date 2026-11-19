# Imagem do extrator de pedidos (PDF/XLS/XLSX/CSV). Construída sozinha pelo extrair.ps1.
FROM python:3.12-slim
RUN pip install --no-cache-dir pymupdf==1.24.10 xlrd==2.0.1 openpyxl==3.1.5
COPY extrair.py /app/extrair.py
WORKDIR /in
ENTRYPOINT ["python", "/app/extrair.py"]
