# Jarvis

Assistente personale da installare sul telefono come app (PWA). Prepara il briefing quotidiano (email dei clienti, canale YouTube, agenda, meteo), risponde a voce e manda una notifica ogni mattina dei giorni feriali.

- **Cervello:** Claude, tramite la Claude API con la sua chiave.
- **Dati:** Gmail, Google Calendar e YouTube in sola lettura; meteo da Open-Meteo, gratuito.
- **Nessun server:** il sito è statico su GitHub Pages. Chiavi, impostazioni e token restano solo sul telefono. Il repository contiene soltanto il codice.
- **Notifica mattutina:** la invia un workflow di GitHub Actions, verso le 7:30 nei giorni feriali.

## Cosa serve

| Cosa | Dove | Costo |
| --- | --- | --- |
| Account GitHub | github.com | gratuito |
| Chiave API Anthropic | console.anthropic.com | a consumo: stima di 2-4 centesimi di dollaro per briefing con Sonnet 5.5, meno per le domande a voce |
| Progetto Google Cloud | console.cloud.google.com | gratuito per questo uso |

## 1. Pubblicare l'app su GitHub Pages

Il codice si trova nel repository pubblico [alberto92rg/Jarvis](https://github.com/alberto92rg/Jarvis). Con un account gratuito, GitHub Pages funziona solo sui repository pubblici. Nel codice non ci sono dati personali.

1. Nel repository vada in **Settings → Pages**. Alla voce *Source* scelga **Deploy from a branch**, poi `main` e `/ (root)`, e salvi.
2. Dopo un paio di minuti l'app sarà online su `https://alberto92rg.github.io/Jarvis/`. La J maiuscola conta: va scritta così anche su Google Cloud.

Per caricare modifiche future da terminale:
```bash
git clone https://github.com/alberto92rg/Jarvis.git
cd Jarvis
# ...modifiche...
git add .
git commit -m "Descrizione della modifica"
git push
```

## 2. Chiave API Anthropic

1. Su [console.anthropic.com](https://console.anthropic.com) apra *API Keys → Create Key*.
2. Ricarichi un po' di credito in *Billing*: 5 dollari bastano per settimane.
3. Copi la chiave: la incollerà nell'app.

## 3. Accesso a Google (Gmail, Calendar, YouTube)

Su [console.cloud.google.com](https://console.cloud.google.com):

1. Crei un nuovo progetto, per esempio `Jarvis`.
2. In **API e servizi → Libreria** abiliti tre API: **Gmail API**, **Google Calendar API** e **YouTube Data API v3**.
3. Configuri la **schermata di consenso OAuth**, che nelle versioni recenti della console si chiama *Google Auth Platform*:
   - tipo di utente **Esterno**, nome app `Jarvis`, la sua email come contatto;
   - lasci l'app **In test** e aggiunga il suo indirizzo Gmail tra gli **utenti di test**.
4. In **Credenziali** (o *Client*) scelga **Crea ID client OAuth**, tipo **Applicazione web**:
   - **Origini JavaScript autorizzate:** `https://alberto92rg.github.io`
   - **URI di reindirizzamento autorizzati:** `https://alberto92rg.github.io/Jarvis/`, con la barra finale. L'app mostra l'indirizzo esatto nelle impostazioni, con il pulsante *Copia*.
5. Copi l'**ID client**, quello che termina con `.apps.googleusercontent.com`.

Al primo collegamento Google mostrerà l'avviso *"Google non ha verificato questa app"*. È normale per un'app personale in prova: tocchi *Avanzate → Vai a Jarvis* e autorizzi tutte e tre le voci.

## 4. Configurare l'app sul telefono

1. Apra `https://alberto92rg.github.io/Jarvis/` con **Chrome** su Android.
2. Tocchi l'icona delle impostazioni, in alto a destra, e compili:
   - **Chiave API Anthropic** e modello (Sonnet 5.5 è il compromesso consigliato);
   - **Client ID OAuth** ed **email** dell'account Google;
   - **Clienti**, uno per riga: `Nome <email>`;
   - **Canale YouTube**, per esempio `@nomecanale`;
   - città e coordinate per il meteo.
3. Tocchi **Salva impostazioni**, poi **Collega Google**.
4. Installi l'app: menu di Chrome (⋮) → **Installa app** oppure **Aggiungi a schermata Home**. Se il browser lo propone, compare anche il pulsante *Installa* in alto.

Per non digitare tutto sul telefono può compilare le impostazioni sul computer, usare *Esporta*, e poi *Importa* sul telefono incollando il testo. Il testo esportato contiene la chiave API: non lo lasci in giro.

## 5. Notifica mattutina

1. Nell'app: **Impostazioni → Notifica mattutina → Attiva notifica mattutina**, e consenta le notifiche.
2. Copi il testo che compare.
3. Su GitHub, nel repository: **Settings → Secrets and variables → Actions → New repository secret**. Come nome scriva `JARVIS_PUSH` e come valore incolli il testo copiato.
4. Per provare subito: scheda **Actions → Notifica mattutina → Run workflow**. La notifica arriva entro pochi secondi; toccandola si apre il briefing.

Il workflow gira due volte ogni mattina dei giorni feriali e invia solo l'esecuzione che a Roma cade alle 7, così funziona sia con l'ora legale sia con la solare. GitHub può ritardare l'avvio di qualche minuto. Per cambiare orario, modifichi `cron` in `.github/workflows/morning.yml` e la variabile `JARVIS_ORA` in `scripts/morning-push.mjs`.

GitHub sospende i workflow programmati dopo 60 giorni senza commit nel repository. Prima la avvisa via email; per riattivarlo basta un clic su *Enable workflow* nella scheda Actions.

## Uso

- **Briefing:** il pulsante *Briefing*, oppure dica "briefing", "buongiorno" o "report" alla campanella.
- **Voce:** tocchi la campanella, parli, e Jarvis risponde a voce. Può chiedere, per esempio: "che impegni ho domani?", "ci sono email dei clienti questa settimana?", "come va il canale?", "pioverà sabato?".
- **Scrivi:** la stessa conversazione, ma con la tastiera.
- Tocchi la campanella mentre Jarvis parla per interromperlo.

## Limiti da conoscere

- **Sola lettura.** Jarvis non invia email e non crea eventi.
- **Accesso a Google.** Il collegamento dura un'ora, poi si rinnova con un passaggio rapido sulla pagina di Google.
- **Meteo.** Le allerte ufficiali della Protezione Civile non sono incluse: Jarvis segnala solo pioggia, temporali e raffiche previsti.
- **YouTube.** Sopra i mille iscritti YouTube arrotonda il numero pubblicato, quindi le variazioni piccole possono non comparire. Like e commenti sono calcolati sugli ultimi 200 video.
- **Voce.** Il riconoscimento vocale funziona in Chrome su Android. Su iPhone il supporto è limitato: resta disponibile *Scrivi*.

## Struttura

```
index.html, css/, js/       l'app
sw.js, manifest.webmanifest funzionamento offline, installazione, notifiche
icons/                      icone dell'app
scripts/morning-push.mjs    invio della notifica mattutina
.github/workflows/          pianificazione su GitHub Actions
```
