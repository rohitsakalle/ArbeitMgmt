# Bundled PDF code and font notices

The local build copies the pinned npm package artifacts and their notices into `src/vendor` (ignored/generated), then into the distributable `dist/src/vendor`. No CDN, remote font fetch or paid service is used at runtime.

| Component | Source | License / included notice |
|---|---|---|
| pdfmake 0.2.20 | `pdfmake` npm package, `build/pdfmake.min.js` | MIT; `pdfmake-LICENSE.txt` copied from the package |
| PDF.js 5.4.296 | `pdfjs-dist` npm package, `build/pdf.mjs` and `pdf.worker.mjs` | Apache-2.0; `pdfjs-LICENSE.txt` copied from the package |
| Roboto Regular/Medium/Italic/MediumItalic | `pdfmake/build/vfs_fonts.js`, unmodified embedded TTF files | SIL Open Font License 1.1; `Roboto-OFL.txt` included in this repository and the distributable |

The bundled font's name-table copyright is **Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)**. The Roboto notice was downloaded from the authors' [official OFL file](https://github.com/googlefonts/roboto-classic/blob/main/OFL.txt) on 27 October 2026. SHA-256 of the included notice: `061402327a96aadb0bfb694a960ed289ecd38d383e396243831ab81feb109c41`. The fonts are not renamed or sold separately; font subsetting/embedding is performed by the PDF library for generated reports.

pdfmake's browser bundle also includes transitive dependencies. The build copies it intact and generates `THIRD-PARTY-NOTICES.txt` from installed runtime packages: published license/notice files or, where upstream omits a separate notice, its README and package license/author metadata. Exact dependency resolutions/integrity hashes are in `package-lock.json`; retain notices when distributing the build.

These are third-party software/font licenses, not legal approval of the product. Review dependency maintenance and updates before release. The installation currently warns that transitive `crypto-js` and `jpeg-exif` packages are deprecated; a clean advisory audit is not proof that a dependency is maintained or safe for every input.
