import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, MapPin, SearchCheck } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import Footer from "@/components/landing/Footer";
import ArticleBody from "@/components/ArticleBody";
import { Button } from "@/components/ui/button";
import { CITIES_LIST, getCity } from "@/lib/cities";

/**
 * /ai-receptionist/:city — one city landing page from
 * scripts/cities-data.mjs. ONE component renders every city; adding a
 * city is a data-only change. The visible body and FAQ render the same
 * data the static prerender ships in the no-JS fallback and the FAQPage
 * JSON-LD (one wording, three surfaces — see scripts/seo-routes.mjs).
 */
const CityPage = () => {
  const { city: slug } = useParams<{ city: string }>();
  const city = getCity(slug);

  if (!city) return <Navigate to="/" replace />;

  const others = CITIES_LIST.filter((c) => c.slug !== city.slug);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 sm:px-6 py-10 sm:py-14 max-w-3xl">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <MapPin className="w-4 h-4" />
          AI receptionist · {city.cityName}
        </p>

        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-6">{city.headline}</h1>

        <img
          src={city.image}
          alt={city.imageAlt}
          className="w-full aspect-[16/9] object-cover rounded-xl mb-10"
        />

        <ArticleBody blocks={city.body} />

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground mb-6">Common questions</h2>
          <div className="space-y-7">
            {city.faq.map((item) => (
              <div key={item.q}>
                <h3 className="text-lg font-medium text-foreground mb-2">{item.q}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-xl border border-primary/25 bg-primary/5 p-6 sm:p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-3">See Aspen work on your own website</h2>
          <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
            The free live demo builds a simulation of our AI receptionist on a preview of your actual site — your
            pages, your services — in about 2 minutes. Nothing is installed and nothing on your site changes. From
            the same page, run the free 25-point visibility audit to see where your business shows up across 25
            neighborhood search points.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/demo">
              <Button size="lg" className="gap-2">
                Try the free live demo
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/demo">
              <Button size="lg" variant="outline" className="gap-2">
                <SearchCheck className="w-4 h-4" />
                Run the free 25-point audit
              </Button>
            </Link>
            <Link to="/book">
              <Button size="lg" variant="outline">
                Book a brief call
              </Button>
            </Link>
          </div>
        </section>

        {others.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Also serving</h2>
            <div className="space-y-4">
              {others.map((other) => (
                <Link
                  key={other.slug}
                  to={other.path}
                  className="flex items-start gap-4 rounded-lg border border-border p-5 hover:border-primary/40 transition-colors"
                >
                  <img
                    src={other.image}
                    alt={other.imageAlt}
                    loading="lazy"
                    className="hidden sm:block w-28 shrink-0 aspect-[16/9] object-cover rounded-md"
                  />
                  <span>
                    <span className="block font-medium text-foreground mb-1">{other.headline}</span>
                    <span className="block text-sm text-muted-foreground leading-relaxed">{other.excerpt}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CityPage;
