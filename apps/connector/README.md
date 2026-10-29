# Nirmaan Connector

A small program for a computer at a site or office that reads devices on the site's network (weighbridges, batching
plants, meters) and sends their readings to Nirmaan. It only calls out, over HTTPS to the API: nothing is opened on the
site's router and it never listens on a port. ARCHITECTURE "Integration layer" has the whole design.

It has no dependencies beyond Node.js 20 or later.

## Set it up

1. In Nirmaan, Administration › Connections › Connectors › Add a Connector. Note the pairing code (good for 30 minutes).
2. On the site computer, copy this folder (with `dist/`, built by `pnpm --filter @erp/connector build`) and pair it:

   ```
   node dist/main.js pair https://<api-host>/api ABCD-EFGH
   ```

3. Start it with the computer:
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1` as administrator (`-Remove` takes it off).
   - Linux: a systemd unit with `ExecStart=/usr/bin/node /opt/nirmaan-connector/dist/main.js run` and `Restart=always`.
4. In Connections, make a connection of a kind the Connector reads and choose this Connector. Its settings reach the
   Connector within a minute.

`node dist/main.js status` says what it is paired to, what it reads and how many readings wait.

## What it does

- Every minute it asks for its settings (that is also how Nirmaan knows it is online), runs the reader of each
  connection it is given, and sends what they read in batches of up to 500.
- Readings wait in `outbox.jsonl` until the server has answered for them, so a day without internet loses nothing
  (up to 100,000 readings, then the oldest go). Each reading has its own id, so a batch sent twice is counted once.
- When the server cannot be reached it keeps reading with the last settings it had and tries again, a little later
  each time, up to six minutes apart.
- If the Connector is removed in Nirmaan or paired again elsewhere, it stops sending and says so in its log.

Its files are in `%ProgramData%\Nirmaan Connector` on Windows and `~/.nirmaan-connector` elsewhere
(`NIRMAAN_CONNECTOR_HOME` to choose): `pairing.json` (its token: keep the folder to administrators), `settings.json`,
`outbox.jsonl` and `connector.log` (rolled over at 5 MB).

## A new kind of device

A kind's reader is one entry in `READERS` (`src/readers.ts`) that returns readings; the server reads the payload in its
handler for the kind (`apps/api/src/integrations`). `npm test` checks the outbox.
