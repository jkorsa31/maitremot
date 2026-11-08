# @maitremot/lexicon-fr

French dictionary data for MaitreMot.

- `src/generated/words.ts`: the ~400,000 words playable on the board (A–Z, no accents).
- `src/generated/lexicon.ts`: real spellings with their lemmas, used to look up definitions.

Both files are **generated** by `npm run build:dictionary -w @maitremot/tools`; do not edit them.

## License

The data is derived from the French dictionary of [Grammalecte](https://grammalecte.net/)
by Olivier R. and contributors (npm package `dictionary-fr`), distributed under the
[Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/). The generated files are
therefore distributed under the MPL 2.0 as well; the source they are built from is the
`dictionary-fr` package.
