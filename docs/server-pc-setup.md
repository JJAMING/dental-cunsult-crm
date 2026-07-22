# Server PC setup

Run this only on the Windows PC that has Dentweb installed or has the authorized Dentweb database connection.

## Installed desktop app (recommended)

The packaged desktop app includes the local server agent, so the server PC does not need a separate project folder or Node.js installation.

1. Install `Dental Consult CRM Setup.exe` on the Dentweb server PC.
2. Open PowerShell as Administrator and run the bundled `setup-dentweb-server.ps1` script from the installed app's `resources\\agent` folder.
3. Enter the clinic ID, clinic name, and the Supabase service-role key when prompted. If the Dentweb SQL Server address is supplied, enter its read-only password when prompted as well.
4. The script stores server-only settings under `%APPDATA%\\Dental Consult CRM\\agent`, creates a logon task, and adds the Private-LAN firewall rule for port `34254`.
5. Open the desktop app, select server mode, then run Dentweb discovery and the read-only connection test.

The scheduled task runs the installed app with `--agent`; it does not show a browser window. Client PCs use their own desktop app and connect to this server's LAN address.

## Before setup

1. Install Node.js 24 or later.
2. Place or clone this project on the server PC.
3. Confirm the clinic application key and clinic name in the Dental Consult CRM admin mode.
4. Keep the Supabase service role key available. It must never be entered into a browser, Vercel, or GitHub.

## Run setup

Open PowerShell as Administrator in the project folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-dentweb-server.ps1 -ClinicId "your-clinic-key" -ClinicName "Your Clinic Name"
```

For a Dentweb SQL Server connection, include the database host. The script keeps the password out of the command line and asks for it securely.

```powershell
.\\scripts\\setup-dentweb-server.ps1 -ClinicId "your-clinic-key" -ClinicName "Your Clinic Name" -DentwebSqlServer "your-dentweb-server-ip"
```

The script creates the local server configuration, prompts for server-only credentials, registers the local API to start at Windows logon, and allows the API port on the Private LAN profile.

## Verify

1. Open `http://127.0.0.1:34254/health` on the server PC.
2. In CRM admin mode, select Server Mode and confirm the clinic and port.
3. Run the Dentweb read-only connection test.
4. Run a read-only sync for patient and appointment data.
5. On another internal PC, select Client Mode, enter the server address and pairing code, then approve the request on the server PC.

## Desktop client

The Vercel web site is served over HTTPS, so a normal browser can block direct requests to an internal `http://` server address. Use the Desktop Client on reception, consultation, and doctor PCs.

For local development:

```powershell
npm run dev
npm run desktop:local
```

To create a Windows installer:

```powershell
npm run desktop:dist
```

The Desktop Client keeps Node.js disabled in the page itself. It passes only approved requests to a private-network Dental Consult local API on port `34254` through a narrow native bridge.

## Security

- Use only a Private Windows network profile.
- The setup script limits the firewall rule to the local subnet.
- The service role key is stored only in the server runtime's `server-secrets.env` file: `%APPDATA%\\Dental Consult CRM\\agent` for an installed app, or `.dentweb-local` for source-project setup. Both paths are excluded from Git.
- Rotate the Supabase service role key if it was shared outside a secure administrator channel.
- Dentweb SQL credentials are stored only on the server PC in the same restricted secret file. Use the vendor-provided read-only account; never use a Dentweb write account.
