#!/usr/bin/env python3
"""Extrai o texto de pedidos (PDF, XLS, XLSX, CSV) em linhas de tabela legíveis.

Não rode direto: use o wrapper do Windows (roda isto num container Docker, imagem mips-extrair):
  powershell -NoProfile -File scripts/etiquetas/extrair.ps1 "D:\\...\\arquivo.pdf"

Saída: uma linha por linha de tabela, células separadas por " | ".
PDF: usa a detecção de tabelas do PyMuPDF; sem tabela, cai para o texto corrido.
Página sem texto = escaneada (precisa de leitura humana ou modelo com visão).
Dependências (pymupdf, openpyxl, xlrd) ficam na imagem — ver Dockerfile ao lado.
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


def nome_cor(rgb):
    """Nome aproximado de uma cor de fundo (None = sem cor/branco)."""
    if not rgb:
        return None
    r, g, b = rgb
    if r > 235 and g > 235 and b > 235:
        return None
    if r > 200 and g > 180 and b < 160:
        return "AMARELO"
    if g > r + 30 and g > b:
        return "VERDE"
    if r > g + 40 and r > b + 40:
        return "VERMELHO/LARANJA"
    if b > r + 30:
        return "AZUL"
    if abs(r - g) < 20 and abs(g - b) < 20:
        return "CINZA"
    return "#%02x%02x%02x" % (r, g, b)


def marcar_cor(texto, cor):
    if not cor:
        return texto
    return f"{texto} [fundo {cor}]" if limpar(texto) else f"[fundo {cor}]"


def extrair_xls(caminho):
    import xlrd

    try:
        livro = xlrd.open_workbook(caminho, formatting_info=True)
    except NotImplementedError:
        livro = xlrd.open_workbook(caminho)
    coloridas = False
    for aba in livro.sheets():
        print(f"\n--- aba '{aba.name}' ({aba.nrows} linhas x {aba.ncols} colunas)")
        linhas = []
        for r in range(aba.nrows):
            celulas = []
            for c in range(aba.ncols):
                cel = aba.cell(r, c)
                if cel.ctype == xlrd.XL_CELL_DATE:
                    try:
                        texto = xlrd.xldate_as_datetime(cel.value, livro.datemode).strftime("%Y-%m-%d (data)")
                    except Exception:
                        texto = numero(cel.value)
                elif cel.ctype == xlrd.XL_CELL_NUMBER:
                    texto = numero(cel.value)
                else:
                    texto = limpar(cel.value)
                cor = None
                if livro.formatting_info and texto:
                    xf = livro.xf_list[cel.xf_index]
                    if xf.background.fill_pattern:
                        cor = nome_cor(livro.colour_map.get(xf.background.pattern_colour_index))
                if cor:
                    coloridas = True
                celulas.append(marcar_cor(texto, cor))
            linhas.append(celulas)
        imprimir_linhas(linhas)
    if coloridas:
        print("(células com [fundo COR] estão pintadas na planilha — veja se há legenda tipo 'amarelo = pão de leite')")


def extrair_xlsx(caminho):
    import datetime
    import openpyxl

    livro = openpyxl.load_workbook(caminho, data_only=True)
    coloridas = False
    for aba in livro.worksheets:
        print(f"\n--- aba '{aba.title}'")
        linhas = []
        for linha in aba.iter_rows():
            celulas = []
            for cel in linha:
                v = cel.value
                if isinstance(v, (datetime.datetime, datetime.date)):
                    texto = v.strftime("%Y-%m-%d (data)")
                else:
                    texto = numero(v)
                cor = None
                try:
                    fill = cel.fill
                    rgb = fill.fgColor.rgb if fill and fill.fill_type == "solid" else None
                    if isinstance(rgb, str) and len(rgb) >= 6:
                        h = rgb[-6:]
                        cor = nome_cor((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)))
                except Exception:
                    cor = None
                if cor and texto:
                    coloridas = True
                    texto = marcar_cor(texto, cor)
                celulas.append(texto)
            linhas.append(celulas)
        imprimir_linhas(linhas)
    if coloridas:
        print("(células com [fundo COR] estão pintadas na planilha — veja se há legenda tipo 'amarelo = pão de leite')")


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
