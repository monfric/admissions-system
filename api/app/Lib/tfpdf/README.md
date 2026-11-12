# tFPDF 1.33

PDF library used for the letters and the uniform measurement form, copied from
https://github.com/Setasign/tFPDF (official releases: http://fpdf.org/en/script/script92.php).
Licence: LGPL (tFPDF), FPDF licence (permissive). Unchanged except for being
loaded by `App\Services\Pdf\PdfDocument`.

Fonts come from `api/assets/fonts/` (Noto Serif, SIL Open Font Licence); tFPDF
writes its font cache to `api/storage/fonts/unifont/`.
