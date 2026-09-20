# iTópos

**Interactive mapping, exploration, and temporal visualization of places from
the [Pleiades gazetteer](https://pleiades.stoa.org/), built for researchers and students.**

iTópos is an open-source, browser-based tool for exploring the geography and temporal evidence of places in the ancient
world using the Pleiades gazetteer.
Map a list of Pleiades IDs from a spreadsheet, browse the local Pleiades corpus by name, Feature Category, or Time
Period, explore spatial patterns, and export place data for further research.

All spreadsheet parsing and map interaction take place in the browser. iTópos uses a locally generated snapshot of
Pleiades data rather than making API requests while you work.

## Features

- **Map Pleiades IDs from CSV or Excel.** Upload a list of Pleiades place identifiers with an optional `group` column.
- **Browse Pleiades Places.** Search by Pleiades ID, place name, Feature Category, or Time Period.
- **Explore mapped Places.** Filter and highlight user-defined Groups and Pleiades Feature Categories, with Place counts
  for each.
- **Temporal Exploration.** Visualize overlapping Pleiades Time Periods as intervals, select or combine periods, filter
  by attestation confidence, and play periods in chronological order while the map changes with the temporal evidence.
- **Inspect temporal evidence.** Place popups summarize Pleiades Location and Name evidence by Time Period and
  attestation confidence, including records with an unspecified date range.
- **Cluster or decluster Places.** Use clustering for overview maps or display individual Places when working with
  smaller datasets.
- **Export mapped Places.** Download selected Pleiades fields as CSV or JSON for further analysis.

## Quick start

iTópos is a static web application. No application server or database is required at runtime.

Clone the repository:

```bash
git clone https://github.com/dhtoolbox/iTopos.git
cd iTopos
```

Serve the project directory with a local HTTP server. For example:

```bash
npx http-server . --cors -c-1
```

Then open the local URL shown in the terminal.

Opening `index.html` directly with a `file://` URL is not recommended because browsers restrict access to local modules
and data files.

## Mapping your own Places

iTópos reads an Excel workbook, a TXT, or a CSV file.

Each place needs a Pleiades ID. The simplest file is one column of IDs; canonical Pleiades place URIs are accepted too.
A header row is optional and case-insensitive.

Add a group column to categorize places. Use one group name per row. Repeat an ID on additional rows when a place
belongs to more than one group.

Example:

```csv
id,group
579885,Greek cities
423025,Greek cities
668394,Levant
https://pleiades.stoa.org/places/590412,Cluster D
```

```csv
579885
423025
668394
https://pleiades.stoa.org/places/590412
```

Extra columns are ignored; hidden or filtered Excel rows are skipped; all worksheets are processed.

Sample CSV and Excel templates are available in [`static/samples/`](static/samples/).

### Groups

Groups are optional user-supplied classifications. A Place may occur in more than one Group when it appears in multiple
rows.

When grouping is enabled, iTópos distinguishes Places assigned to one Group, multiple Groups, or no specified Group.

## Browse Places

The **Browse Places** tab provides another way to assemble a mapped set without preparing a spreadsheet.

Places can be found by:

- Pleiades ID
- Place Name
- Feature Category
- Time Period

Search options can be cross-referenced to narrow the results before mapping.

Feature Categories correspond to the Pleiades place-type vocabulary.

## Export mapped Places

Mapped Places can be exported as **CSV** or **JSON** with a selection of available Pleiades fields.

CSV exports one row per Place and Group, when applicable. Multiple Feature Categories are separated by semicolons. JSON
preserves arrays.

Exported fields can include:

- Pleiades ID
- title
- representative latitude and longitude
- Feature Category terms
- Feature Category keys
- user Group(s)

## Temporal Exploration

Pleiades Time Periods are not treated as consecutive bins on a conventional linear slider. Historical periods may
overlap, span different lengths of time, and reflect different geographical or scholarly frameworks.

iTópos therefore displays selected Time Periods as overlapping intervals. You can:

- choose which Time Periods appear in the temporal interface;
- select one or several periods;
- filter temporal evidence by Pleiades attestation confidence;
- play displayed periods in chronological order by their starting dates;
- watch mapped evidence change as each period is explored;
- disable temporal filtering while retaining the temporal visualization;
- inspect Location and Name evidence in Place popups.

Absence of temporal evidence for a selected period does **not** assert that a Place did not exist during that period.
It means that the Pleiades data used by iTópos does not provide qualifying temporal evidence for that Place under the
current selection.

## Pleiades data

iTópos uses a static local snapshot derived from
the [Pleiades downloadable dataset](https://atlantides.org/downloads/pleiades/json/).
The browser does not query the Pleiades API while the application is being used.

The local dataset includes mappable and unmappable Pleiades Places. Places without a representative point will be
reported during processing but cannot be displayed on the map.

The interface reports the refresh date of the local Pleiades dataset.

Generated browser data is stored under:

```text
static/data/pleiades/
```

The repository includes a browser-ready Pleiades snapshot. The deployed site refreshes its Pleiades data automatically
from the current downloadable dataset.

## Basemap data

The bundled basemap data was prepared from open geospatial sources including:

- **Ancient World Mapping Center (AWMC)** geodata  
  <https://github.com/AWMC/geodata>
- **Natural Earth**  
  <https://www.naturalearthdata.com/>

See [`static/map/README.md`](static/map/README.md) for basemap processing and attribution details.

## Development

Install the JavaScript development dependencies:

```bash
npm install
```

Run the JavaScript development server:

```bash
npm start
```

OR

```bash
npm run start:nocache
```

Run the JavaScript test suite:

```bash
npm test
```

Run the Python maintenance tests:

```bash
pytest
```

The browser application does **not** require Python.

### Maintenance scripts

Python scripts under [`maintenance/`](maintenance/) build or refresh static data used by iTópos.

The Pleiades ETL/export pipeline is used for regular dataset refreshes. The map-processing scripts are only needed when
rebuilding the basemap assets.

Dependencies are listed separately in:

```text
maintenance/requirements.txt
maintenance/maps/requirements.txt
```

These dependencies are **not** required to run iTópos in the browser.

## Project structure

```text
static/
  css/                 component styles
  data/pleiades/       generated browser-ready Pleiades data
  js/
    basemaps/          basemap controls
    data/              parsing, resolution, and data utilities
    map/               marker and map-style logic
    widgets/           interface components
  map/                 bundled PMTiles basemaps
  samples/             sample upload templates
  vendor/              vendored browser dependencies and icons

maintenance/           Pleiades and basemap build/update scripts
tests/                 JavaScript and Python tests
```

## Data, software, and attribution

iTópos builds on several open projects and datasets. Please retain and follow the licenses and attribution requirements
of the underlying sources.

- **Pleiades** — ancient-world gazetteer and place data  
  <https://pleiades.stoa.org/>
- **Ancient World Mapping Center (AWMC)** — geospatial data (Political Shading)  
  <https://github.com/AWMC/geodata>
- **Natural Earth** — physical and cultural geospatial data  
  <https://www.naturalearthdata.com/>
- **MapLibre GL JS** — web mapping library  
  <https://maplibre.org/>
- **PMTiles** — tiled map archive support  
  <https://github.com/protomaps/PMTiles>
- **Papa Parse** — CSV parsing  
  <https://www.papaparse.com/>
- **SheetJS** — spreadsheet parsing  
  <https://sheetjs.com/>

Additional vendored-library and icon information is available under [`static/vendor/`](static/vendor/).

## Citation

If you use iTópos in research, teaching, or publication, please cite the software. Citation metadata is provided in [
`CITATION.cff`](CITATION.cff).

A DOI can be added to the citation metadata when an archived release becomes available.

## License

iTópos source code is licensed under the [Apache License 2.0](LICENSE).

Data, maps, fonts, icons, and third-party libraries included with or used by iTópos may be distributed under their own
licenses. See the relevant attribution and license files for details.