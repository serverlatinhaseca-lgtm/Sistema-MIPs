#!/usr/bin/env python3
"""Extrai o texto de pedidos (PDF, XLS, XLSX, CSV) em linhas de tabela legíveis.

Uso (no WSL): python3 extrair.py ARQUIVO [ARQUIVO...]
No Windows use o wrapper: powershell -NoProfile -File scripts/etiquetas/extrair.ps1 "D:\\...\\arquivo.pdf"

Saída: uma linha por linha de tabela, células separadas por " | ".
PDF: usa a detecção de tabelas do PyMuPDF; sem tabela, cai para o texto corrido.
Página sem texto = escaneada (precisa de leitura humana ou modelo com visão).
Dependências no WSL: pymupdf, openpyxl, xlrd (pip3 install --user --break-system-packages ...).
"""
import csv
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")


def limpar(valor):
    if valor is None:
        return ""
    texto = str(valor).replace("\r", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", texto).strip()


def numero(valor):
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return limpar(valor)


def imprimir_linhas(linhas):
    for i, celulas in enumerate(linhas, 1):
        celulas = [limpar(c) for c in celulas]
        while celulas and not celulas[-1]:
            celulas.pop()
        if any(celulas):
            print(f"{i:>3}: " + " | ".join(celulas))


def extrair_pdf(caminho):
    try:
        import pymupdf
    except ImportError:
        import fitz as pymupdf
    doc = pymupdf.open(caminho)
    for n, pagina in enumerate(doc, 1):
        texto = pagina.get_text().strip()
        print(f"\n--- página {n}/{doc.page_count}")
        if len(texto) < 20:
            print("!! PÁGINA SEM TEXTO (escaneada). Não dá para ler aqui: peça os números ao usuário.")
            continue
        tabelas = []
        try:
            tabelas = pagina.find_tables().tables
        except Exception:
            tabelas = []
        if not tabelas:
            print("(sem tabela detectada — texto corrido)")
            for linha in texto.splitlines():
                if linha.strip():
                    print("     " + limpar(linha))
            continue
        for t, tabela in enumerate(tabelas, 1):
            print(f"[tabela {t}]")
            # tabela.extract() junta letras/números errado ("0,05" -> "005 ,");
            # lê o texto de cada célula pela área dela.
            linhas = []
            for row in tabela.rows:
                linhas.append([
                    pagina.get_text("text", clip=pymupdf.Rect(cel)) if cel else ""
                    for cel in row.cells
                ])
            imprimir_linhas(linhas)
        # Texto fora das tabelas (títulos como "DESJEJUM", "LANCHE DA TARDE")
        fora = []
        for bloco in pagina.get_text("blocks"):
            x0, y0, x1, y1, conteudo = bloco[:5]
            dentro = any(
                x0 >= tb.bbox[0] - 2 and y0 >= tb.bbox[1] - 2 and x1 <= tb.bbox[2] + 2 and y1 <= tb.bbox[3] + 2
                for tb in tabelas
            )
            if not dentro and limpar(conteudo):
                fora.append(limpar(conteudo))
        if fora:
            print("[texto fora da tabela] " + " / ".join(fora))


def extrair_xls(caminho):
    import xlrd

    livro = xlrd.open_workbook(caminho)
    for aba in livro.sheets():
        print(f"\n--- aba '{aba.name}' ({aba.nrows} linhas x {aba.ncols} colunas)")
        linhas = []
        for r in range(aba.nrows):
            celulas = []
            for c in range(aba.ncols):
                cel = aba.cell(r, c)
                if cel.ctype == xlrd.XL_CELL_DATE:
                    try:
                        celulas.append(xlrd.xldate_as_datetime(cel.value, livro.datemode).strftime("%Y-%m-%d (data)"))
                    except Exception:
                        celulas.append(numero(cel.value))
                elif cel.ctype == xlrd.XL_CELL_NUMBER:
                    celulas.append(numero(cel.value))
                else:
                    celulas.append(cel.value)
            linhas.append(celulas)
        imprimir_linhas(linhas)


def extrair_xlsx(caminho):
    import datetime
    import openpyxl

    livro = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    for aba in livro.worksheets:
        print(f"\n--- aba '{aba.title}'")
        linhas = []
        for linha in aba.iter_rows(values_only=True):
            celulas = []
            for v in linha:
                if isinstance(v, (datetime.datetime, datetime.date)):
                    celulas.append(v.strftime("%Y-%m-%d (data)"))
                else:
                    celulas.append(numero(v))
            linhas.append(celulas)
        imprimir_linhas(linhas)


def extrair_csv(caminho):
    with open(caminho, newline="", encoding="utf-8-sig", errors="replace") as f:
        amostra = f.read(4096)
        f.seek(0)
        try:
            dialeto = csv.Sniffer().sniff(amostra, delimiters=";,\t")
        except csv.Error:
            dialeto = csv.excel
        imprimir_linhas(list(csv.reader(f, dialeto)))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for caminho in sys.argv[1:]:
        print("=" * 70)
        print(f"ARQUIVO: {os.path.basename(caminho)}")
        print("=" * 70)
        ext = os.path.splitext(caminho)[1].lower()
        try:
            if ext == ".pdf":
                extrair_pdf(caminho)
            elif ext == ".xls":
                extrair_xls(caminho)
            elif ext in (".xlsx", ".xlsm"):
                extrair_xlsx(caminho)
            elif ext in (".csv", ".txt"):
                extrair_csv(caminho)
            else:
                print(f"!! formato não suportado: {ext} (imagens precisam ser digitadas pelo usuário)")
        except Exception as erro:  # noqa: BLE001
            print(f"!! erro ao ler: {erro}")
        print()


if __name__ == "__main__":
    main()
