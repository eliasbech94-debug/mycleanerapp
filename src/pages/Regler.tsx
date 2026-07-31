import { cancellationLadderBullets } from "@/lib/cancellationPolicyCopy";

export default function Regler() {
  return (
    <main className="container-wide py-12 max-w-3xl">
      <h1 className="font-heading text-4xl mb-3">Regler og vilkår</h1>
      <p className="text-muted-foreground mb-10">
        MyCleaner-platformen er en digital markedsplads, der forbinder kunder med selvstændige providere.
        MyCleaner udfører ikke selv ydelsen og er ikke part i aftalen om udførelsen af opgaven.
        Disse regler gælder for både kunder og providere.
      </p>

      <section className="space-y-8">
        <div>
          <h2 className="font-heading text-2xl mb-3">1. Adfærd på platformen</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Vær respektfuld og professionel i al kommunikation.</li>
            <li>Ingen chikane, diskrimination eller upassende sprog.</li>
            <li>Al kommunikation skal ske gennem platformen, indtil booking er bekræftet.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">2. Betaling og gebyrer</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Platformgebyret er 28% — 14% lægges oveni kundens pris, og 14% trækkes fra providerens indtjening.</li>
            <li>Der oprettes en betalingsreservation på kundens betalingsmetode ved booking. Beløbet hæves, når opgaven er registreret som udført.</li>
            <li>Ingen underbud — selvstændige providere skal overholde landets minimumssats.</li>
            <li>Providerens indtjening udbetales som planlagt udbetaling. Det præcise tidspunkt, hvor beløbet bliver synligt på kontoen, afhænger af betalingsudbyderen og providerens bank.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">3. Afbestilling</h2>
          <p className="text-muted-foreground mb-3">
            Refusionen afhænger af, hvor lang tid der er til bookingens præcise starttidspunkt, når aflysningen registreres:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {cancellationLadderBullets().map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>Tidspunkterne beregnes ud fra bookingens præcise start i bookingens tidszone. De eksakte tidspunkter vises på bookingbekræftelsen.</li>
            <li>Reglerne gælder bookinger oprettet efter policyens ikrafttrædelse. Eksisterende bookinger afregnes efter den version, kunden accepterede ved booking.</li>
            <li>
              Er beløbet endnu ikke hævet, annulleres reservationen i stedet, og der opkræves intet.
              Afbestiller provideren, refunderes kunden fuldt ud.
            </li>
            <li>Providere der afbestiller kort før opgaven risikerer suspension.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">4. Klager og refusion</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Klager skal indsendes inden for 48 timer efter opgavens planlagte eller registrerede afslutning.</li>
            <li>MyCleaner Support gennemgår sagen og de indsendte oplysninger, typisk inden for 5 hverdage.</li>
            <li>MyCleaner Support gennemgår de tilgængelige oplysninger fra begge parter, før der registreres en beslutning.</li>
            <li>En godkendt refundering sendes tilbage til den anvendte betalingsmetode. Behandlingstiden afhænger af betalingsudbyderen og kundens bank.</li>
          </ul>
        </div>


        <div>
          <h2 className="font-heading text-2xl mb-3">5. Skat og indberetning</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Selvstændige providere er selv ansvarlige for at indberette indtjening til Skat (rubrik 20).</li>
            <li>Business-providere skal registrere moms hvis omsætningen overstiger 50.000 kr/år.</li>
            <li>Kunder kan anvende servicefradrag for berettigede ydelser — se skat.dk.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">6. Nøgler og adgang</h2>
          <p className="text-muted-foreground">
            MyCleaner modtager, opbevarer eller administrerer ikke nøgler. Eventuel adgang eller nøgleudlevering
            aftales direkte mellem kunden og den selvstændige provider og sker på parternes eget ansvar.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">7. Suspension og ophør</h2>
          <p className="text-muted-foreground">
            MyCleaner forbeholder sig retten til at suspendere eller ophæve konti der overtræder disse regler.
            Alvorlige overtrædelser kan medføre permanent udelukkelse og eventuel politianmeldelse.
          </p>
        </div>
      </section>
    </main>
  );
}
