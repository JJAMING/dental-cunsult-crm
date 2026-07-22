# Server PC setup

Run this only on the Windows PC that has Dentweb installed or has the authorized Dentweb database connection.

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

The script creates the local server configuration, prompts for the server-only Supabase key, registers the local API to start at Windows logon, and allows the API port on the Private LAN profile.

## Verify

1. Open `http://127.0.0.1:34254/health` on the server PC.
2. In CRM admin mode, select Server Mode and confirm the clinic and port.
3. Run Dentweb discovery and a read-only connection test.
4. Map patient and appointment fields, preview the mapping, then run a read-only sync.
5. On another internal PC, select Client Mode, enter the server address and pairing code, then approve the request on the server PC.

## Security

- Use only a Private Windows network profile.
- The setup script limits the firewall rule to the local subnet.
- The service role key is stored only in `.dentweb-local/server-secrets.env`, which is ignored by Git.
- Rotate the Supabase service role key if it was shared outside a secure administrator channel.
