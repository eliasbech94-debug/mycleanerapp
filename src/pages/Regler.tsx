export default function Regler() {
  return (
    <main className="container-wide py-12 max-w-3xl">
      <h1 className="font-heading text-4xl mb-3">Regler og vilkår</h1>
      <p className="text-muted-foreground mb-10">
        HomeHero er en tillidsbaseret platform. Disse regler gælder for både kunder og providere.
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
            <li>Platformgebyret er 28% — 14% oveni kundens pris, 14% trukket fra provideren.</li>
            <li>Betaling reserveres ved booking, hæves ved fuldført opgave.</li>
            <li>Ingen underbud — providere skal overholde landets minimums-timeløn.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">3. Afbestilling</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Gratis afbestilling indtil 24 timer før opgaven.</li>
            <li>Herefter opkræves 50% af opgavens pris.</li>
            <li>Providere der afbestiller kort før opgaven risikerer suspension.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">4. Klager og refusion</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Klager skal indsendes inden for 48 timer efter opgavens afslutning.</li>
            <li>Vores supportteam vurderer sagen og træffer beslutning inden for 5 hverdage.</li>
            <li>Refusion sker via Stripe til det oprindelige betalingsmiddel.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">5. Skat og indberetning</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Private udbydere er selv ansvarlige for at indberette indtjening til Skat (rubrik 20).</li>
            <li>Business-providere skal registrere moms hvis omsætningen overstiger 50.000 kr/år.</li>
            <li>Kunder kan anvende servicefradrag for berettigede ydelser — se skat.dk.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-3">6. Suspension og ophør</h2>
          <p className="text-muted-foreground">
            HomeHero forbeholder sig retten til at suspendere eller ophæve konti der overtræder disse regler.
            Alvorlige overtrædelser kan medføre permanent udelukkelse og eventuel politianmeldelse.
          </p>
        </div>
      </section>
    </main>
  );
}
