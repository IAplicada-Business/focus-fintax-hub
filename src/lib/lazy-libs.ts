/**
 * Bibliotecas pesadas carregadas sob demanda.
 *
 * `xlsx` tem ~430 kB e `jspdf` + `html2canvas` mais ~600 kB. Importadas no
 * topo dos módulos, elas entravam no pacote da lista de clientes, da ficha
 * do cliente e das intimações — toda abertura de tela baixava tudo isso
 * mesmo sem ninguém exportar planilha ou PDF.
 *
 * O namespace fica guardado numa variável de módulo de propósito: quando o
 * resultado de `import()` só é usado por membros conhecidos (`XLSX.utils`,
 * `XLSX.writeFile`), o Rollup converte o import dinâmico em estático e a
 * divisão de código some. Guardar a promessa impede essa otimização.
 */
type XlsxModule = typeof import("xlsx");

let xlsxPromise: Promise<XlsxModule> | undefined;

/** SheetJS, carregado uma vez e reaproveitado nas próximas exportações/importações. */
export function loadXlsx(): Promise<XlsxModule> {
  xlsxPromise ??= import("xlsx");
  return xlsxPromise;
}
