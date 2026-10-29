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

## Weighbridge

A **Weighbridge** connection (Administration › Connections, item 148) has the Connector read the weighbridge's
indicator, which most models send continuously several times a second (`ST,GS,+0026420kg`, `  26420`, STX/ETX frames,
weights in kg or t):

- **Serial port**: the indicator's RS-232 output to the computer, directly or through a USB-serial cable. Type the port
  as the computer names it (`COM3` on Windows, `/dev/ttyUSB0` on Linux) and the indicator's baud rate (often 9600 or
  2400); the Connector sets the port to 8 bits, no parity, 1 stop bit with `mode` or `stty`. Close the weighbridge
  vendor's own software first if it holds the port, or put a serial splitter on the cable.
- **Network address**: an indicator with a network port, or its serial output through a serial-to-network box on the
  site's network (`192.168.1.50`, port `4001`). The Connector connects to it; it still opens nothing to the internet.

A weight counts once it is above the empty bridge (200 kg unless set) and holds within the indicator's step for three
seconds; the next weight waits until the bridge has been empty again. Each one reaches Stock › Weighbridge within a
minute, where the store puts it on the truck's ticket. Readings wait in the outbox like any other while the internet is
down. When the indicator says nothing for ten minutes, the log says so once.

## Batching plant

A **Batching plant** connection (Administration › Connections, item 149) has the Connector read the batch reports a
batching plant's controller writes to a folder on its control room computer. Set the controller to export each batch
(or the day's batches) as CSV or text, and type the folder in full (`D:\Batch Reports`, or a share such as
`\\PLANT-PC\Reports`). The first time, reports changed in the last two days are read (set it from 1 to 30); after that
a file is read again only when it changes, and each row is sent once, so a report rewritten through the day is fine.
Rows reach RMC plant › From the batcher within a minute or two, where the plant matches the report's columns once and
makes each batch's challan. A file over 5 MB is left and named in the log.

## A new kind of device

A kind's reader is one entry in `READERS` (`src/readers.ts`) that returns readings; the server reads the payload in its
handler for the kind (`apps/api/src/integrations`). `npm test` checks the outbox, the weighbridge frames and the batch reports.
