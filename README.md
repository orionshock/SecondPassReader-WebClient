# Second Pass Reader

Second Pass Reader is a standalone web reader for your Second Pass Library. Browse your books,
read EPUBs in the browser, and keep your highlights, notes, and reading progress together.
Save books for offline reading so you can continue when you're disconnected.

## Features

- Browse and search Books, Authors, Series, and catalog tags; organize books on personal Shelves.
- Resume from Recent History and track your progress through Reading Sessions.
- Read EPUBs with in-book search, a table of contents, and adjustable display settings.
- Create bookmarks, highlights, and notes, and revisit Marginalia from earlier Reading Sessions.
- Import highlights and notes from Glasp CSV and Second Pass Marginalia exports.
- Keep selected books available offline, with local reading progress and Marginalia.
- Reconnect through alternative configured routes to your Library.

## Getting started

You'll need a Second Pass Library to connect to. Open the Reader, enter your Library address,
and follow the code-based linking flow to authorize access.

Prebuilt images are available from
[GHCR](https://github.com/orionshock/SecondPassReader-WebClient/pkgs/container/secondpassreader-webclient)
at `ghcr.io/orionshock/secondpassreader-webclient`. Deploy with Docker Compose using the
[example configuration](docker/compose.example.yml); no source checkout or build toolchain is
needed on the deployment host. See [Deployment](docs/deployment.md) for setup and configuration.

For local development, see [Development](docs/DEVELOPMENT.md) for prerequisites and how to run
the app.

## Documentation

- [Development](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/deployment.md)
- [Reader](docs/reader.md)
- [Offline mode](docs/offline-mode.md)

## License

Copyright (c) 2026 Apollo Shockman.

Licensed under the [Apache License 2.0](LICENSE). Third-party libraries and assets retain their
own licenses and copyrights; see [third-party notices](public/THIRD-PARTY-NOTICES).
