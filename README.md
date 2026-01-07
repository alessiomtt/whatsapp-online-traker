<h1 align="center">👻 Stealth WP Tracker</h1>
<p align="center"><strong>Monitoraggio Attività WhatsApp tramite Analisi RTT (Crediti https://github.com/gommzystudio/device-activity-tracker)</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"/>
  <img src="https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.IO"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License MIT"/>
</p>

<br/>

> [!WARNING]
> **DISCLAIMER**: Strumento creato sulla base di https://github.com/gommzystudio/device-activity-tracker, le funzioni implementate possono in alcuni casi non essere stabili o complete, è stata modificata e migliorata anche la logica di tracciamento, la quale può comunque portare a falsi positivi. In questo file README.md non è specificata a pieno la logica di tracciamento, il sistema implementa un ulteriore sistema di calibrazione per migliorare i risultati, il quale parte automaticamente dopo la prima risposta a seguito di X stati Offline consecutivi.

---

<br/>

# 📋 PARTE 1: EXECUTIVE SUMMARY

<br/>

## 🎯 Cosa Fa

<table>
<tr>
<td width="60%">

Stealth WP Tracker rileva **quando un utente è attivo sul telefono** analizzando i tempi di risposta (RTT) dei messaggi WhatsApp.

</td>
<td width="40%">

| | |
|:---:|:---|
| 🔇 | **Silenzioso** - Nessuna notifica al target |
| 📱 | **Zero-install** - Non richiede accesso al dispositivo |
| 🔬 | **Scientifico** - Ricerca accademica peer-reviewed |
| 📊 | **Real-time** - Monitoraggio in tempo reale |

</td>
</tr>
</table>

<br/>

---

## ⚡ Capacità Operative

<table>
<tr>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/🟢-Online-22c55e?style=for-the-badge" alt="Online"/>
<br/><sub>Target attivo</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/🟡-Standby-eab308?style=for-the-badge" alt="Standby"/>
<br/><sub>Telefono inattivo</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/🔴-Offline-ef4444?style=for-the-badge" alt="Offline"/>
<br/><sub>Fuori rete</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/📊-Charts-3b82f6?style=for-the-badge" alt="Charts"/>
<br/><sub>Analisi pattern</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/�-Export-8b5cf6?style=for-the-badge" alt="Export"/>
<br/><sub>PDF & Excel</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/�-Multi-ec4899?style=for-the-badge" alt="Multi"/>
<br/><sub>Più target</sub>
</td>
<td align="center" width="14%">
<img src="https://img.shields.io/badge/📈-Compare-14b8a6?style=for-the-badge" alt="Compare"/>
<br/><sub>Confronto</sub>
</td>
</tr>
</table>

<br/>

---

## 🔍 Casi d'Uso

<details>
<summary><b>🕵️ Investigazioni</b></summary>

- **Verifica alibi**: Conferma se il soggetto era attivo in un determinato orario
- **Correlazione eventi**: Attività durante finestre temporali specifiche  
- **Pattern comportamentali**: Identificazione abitudini di utilizzo
- **Presenza/Assenza**: Verifica attività notturna o in orari insoliti

</details>

<details>
<summary><b>🏢 Sicurezza Aziendale</b></summary>

- Monitoraggio compliance orari di lavoro (con consenso)
- Verifica disponibilità personale reperibile

</details>

<details>
<summary><b>🎓 Ricerca Accademica</b></summary>

- Studio comportamenti digitali
- Analisi vulnerabilità privacy messaging

</details>

<br/>

---

## 🔄 Come Funziona

```mermaid
sequenceDiagram
    participant T as 👻 Tracker
    participant W as 📱 WhatsApp Server
    participant D as 📲 Dispositivo Target
    
    T->>W: Invia Probe (reaction silenziosa)
    W->>D: Consegna messaggio
    D-->>W: Delivery ACK
    W-->>T: Conferma consegna
    
    Note over T: RTT = tempo totale
    
    alt RTT < Soglia
        T->>T: 🟢 ONLINE (dispositivo attivo)
    else RTT > Soglia
        T->>T: 🟡 STANDBY (dispositivo inattivo)
    else Nessun ACK
        T->>T: 🔴 OFFLINE (irraggiungibile)
    end
```

<br/>

---

## 🚀 Quick Start

```bash
# 1️⃣ Clona e installa
git clone [repository]
cd stealth-wp-tracker
npm install && cd client && npm install && cd ..

# 2️⃣ Avvia backend
npm run start:server

# 3️⃣ Avvia frontend (altro terminale)
npm run start:client
```

> [!TIP]
> Apri `http://localhost:3000` → Scansiona QR con WhatsApp → Inserisci numero → Monitora!

<br/>

---

## ⚠️ Limitazioni

> [!NOTE]
> - **Richiede WhatsApp**: Account WhatsApp per inviare probe
> - **No contenuti**: Non intercetta messaggi, solo metadati temporali
> - **Dipendenza rete**: Accuratezza influenzata da qualità connessione
> - **Rate limiting**: WhatsApp può limitare probe ad alta frequenza

<br/>

---

## ⚖️ Note Legali

> [!CAUTION]
> L'utilizzo di questo strumento potrebbe richiedere:
> - Consenso esplicito del soggetto monitorato
> - Autorizzazione giudiziaria
> - Conformità a GDPR e normative locali privacy
>
> **L'utente è responsabile dell'uso conforme alle leggi vigenti.**

<br/>
<br/>

---

# 🔧 PARTE 2: DOCUMENTAZIONE TECNICA

<br/>

## 📁 Architettura

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend (React)"]
        D[Dashboard.tsx]
        CC[ContactCard.tsx]
        CP[ComparePage.tsx]
        DU[DatabaseUtilities.tsx]
    end
    
    subgraph Backend["⚙️ Backend (Node.js)"]
        S[server.ts<br/>Express + Socket.IO]
        T[tracker.ts<br/>RTT Logic]
        C[config.ts<br/>Configuration]
        
        subgraph Services["📦 Services"]
            DB[database.ts<br/>SQLite]
            RTT[rttAnalyzer.ts<br/>Analysis]
        end
    end
    
    subgraph External["🌐 External"]
        WA[WhatsApp<br/>via Baileys]
        SQLite[(tracker.db)]
    end
    
    D <--> S
    CC <--> S
    CP <--> S
    DU <--> S
    
    S --> T
    S --> C
    T --> RTT
    T --> WA
    S --> DB
    DB --> SQLite
```

<br/>

---

## 🛠️ Stack Tecnologico

<table>
<tr>
<th>Layer</th>
<th>Tecnologia</th>
<th>Versione</th>
</tr>
<tr><td>Runtime</td><td><img src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white" alt="Node.js"/></td><td>20+</td></tr>
<tr><td>Language</td><td><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/></td><td>5.0+</td></tr>
<tr><td>Backend</td><td><img src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white" alt="Express"/></td><td>4.x</td></tr>
<tr><td>Realtime</td><td><img src="https://img.shields.io/badge/Socket.IO-010101?logo=socket.io&logoColor=white" alt="Socket.IO"/></td><td>4.x</td></tr>
<tr><td>WhatsApp</td><td><img src="https://img.shields.io/badge/Baileys-25D366?logo=whatsapp&logoColor=white" alt="Baileys"/></td><td>Latest</td></tr>
<tr><td>Database</td><td><img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite"/></td><td>better-sqlite3</td></tr>
<tr><td>Frontend</td><td><img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React"/></td><td>18+</td></tr>
<tr><td>Charts</td><td><img src="https://img.shields.io/badge/Recharts-FF6384?logo=chart.js&logoColor=white" alt="Recharts"/></td><td>2.x</td></tr>
<tr><td>Styling</td><td><img src="https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind"/></td><td>3.x</td></tr>
</table>

<br/>

---

## ⚙️ Configurazione

> [!TIP]
> Accesso Admin Panel: **Doppio click sul logo** → Password admin

<details>
<summary><b>📋 Parametri Editabili</b></summary>

| Parametro | Default | Range | Descrizione |
|-----------|:-------:|:-----:|-------------|
| `probeIntervalDefault` | 2000ms | 50-60000 | Intervallo tra probe |
| `offlineThreshold` | 10000ms | 1000-30000 | RTT sopra = offline |
| `thresholdMultiplier` | 0.9 | 0.5-1.5 | Moltiplicatore soglia |
| `calibrationProbeCount` | 5 | 3-20 | Probe per calibrazione |
| `warmupEnabled` | false | bool | Scarta primi probe |
| `warmupProbeCount` | 2 | 1-5 | Probe da scartare |
| `outlierFilterEnabled` | false | bool | Filtra spike |

</details>

<details>
<summary><b>🔐 Variabili Ambiente</b></summary>

```bash
PORT=3001                    # Server port
CORS_ORIGIN=*               # CORS policy
REACT_APP_API_URL=http://localhost:3001
```

</details>

<br/>

---

## 🧮 Algoritmo di Detection

```mermaid
flowchart LR
    A[Nuovo RTT] --> B{RTT > offlineThreshold?}
    B -->|Sì| C[🔴 OFFLINE]
    B -->|No| D{movingAvg < threshold?}
    D -->|Sì| E[🟢 ONLINE]
    D -->|No| F[🟡 STANDBY]
    
    style C fill:#ef4444,color:#fff
    style E fill:#22c55e,color:#fff
    style F fill:#eab308,color:#000
```

**Calcolo Soglia:**
```
threshold = median(globalRttHistory) × thresholdMultiplier
```

<br/>

---

<details>
<summary><h2>📡 Socket.IO Events Reference</h2></summary>

### Client → Server

| Event | Payload | Descrizione |
|-------|---------|-------------|
| `add-contact` | `string` | Avvia tracking |
| `stop-tracking` | `string` | Ferma tracking |
| `archive-contact` | `string` | Archivia sessione |
| `get-archived` | - | Richiedi archivio |
| `admin-get-config` | - | Richiedi configurazione |
| `admin-save-config` | `EditableConfig` | Salva configurazione |

### Server → Client

| Event | Payload | Descrizione |
|-------|---------|-------------|
| `tracker-update` | `{jid, devices, median, threshold, calibrationProgress}` | Update real-time |
| `connection-open` | - | WhatsApp connesso |
| `qr` | `string` | QR per login |
| `profile-pic` | `{jid, url}` | Foto profilo |

</details>

<details>
<summary><h2>🗄️ Database Schema</h2></summary>

### Tabella `sessions`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | INTEGER PK | ID sessione |
| jid | TEXT UNIQUE | WhatsApp JID |
| phone_number | TEXT | Numero telefono |
| custom_name | TEXT | Nome personalizzato |
| is_active | INTEGER | 0/1 |
| is_archived | INTEGER | 0/1 |
| probe_method | TEXT | 'reaction' o 'delete' |

### Tabella `activity_logs`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | INTEGER PK | ID log |
| session_id | INTEGER FK | Riferimento sessione |
| event_type | TEXT | rtt/online/offline/standby |
| rtt_value | REAL | RTT in ms |
| state | TEXT | Stato rilevato |
| timestamp | TEXT | ISO 8601 |

</details>

<br/>

---

## 🔧 Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| QR non appare | Elimina cartella `auth_info_baileys/` e riavvia |
| Sempre OFFLINE | Verifica numero corretto, riavvia tracking |
| Database corrotto | Usa DatabaseUtilities per export/import |

<br/>

---

## 🛡️ Come Proteggersi

> [!IMPORTANT]
> Per proteggersi da questo tipo di monitoraggio:
> 1. **Settings → Privacy → Advanced → Block unknown senders**
> 2. Limita chi può vedere "last seen"
> 3. Usa VPN per mascherare pattern di connessione

<br/>

---

## 📚 Citazione

<details>
<summary><b>Paper accademico</b></summary>

```bibtex
@inproceedings{gegenhuber2024careless,
  title={Careless Whisper: Exploiting Silent Delivery Receipts 
         to Monitor Users on Mobile Instant Messengers},
  author={Gegenhuber, Gabriel K. and Günther, Maximilian and 
          Maier, Markus and Judmayer, Aljosha and Holzbauer, Florian 
          and Frenzel, Philipp É. and Ullrich, Johanna},
  year={2024},
  organization={University of Vienna, SBA Research}
}
```

</details>

<br/>

---

## 📄 License

MIT License - Vedi file [LICENSE](LICENSE)

<br/>

---

<p align="center">
  <strong>Built with</strong> 
  <a href="https://github.com/WhiskeySockets/Baileys">@whiskeysockets/baileys</a>
</p>

<p align="center">
  <sub>⚠️ Usare responsabilmente. Questo strumento dimostra vulnerabilità reali che riguardano milioni di utenti.</sub>
</p>
