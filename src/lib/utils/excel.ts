import * as XLSX from 'xlsx';

export function downloadExcel(rows: any[], sheetName: string, fileName: string) {
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Auto-size columns slightly
    const cols = Object.keys(rows[0] || {});
    ws['!cols'] = cols.map(c => ({ wch: Math.min(60, Math.max(c.length + 2, 10)) }));
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
}
