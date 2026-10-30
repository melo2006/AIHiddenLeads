import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { useTranslation } from "react-i18next";

import sarahImg from "@/assets/testimonial-sarah.png";
import mikeImg from "@/assets/testimonial-mike.png";
import jessicaImg from "@/assets/testimonial-jessica.png";
import carlosImg from "@/assets/testimonial-carlos.png";

const testimonials = [
  {
    key: "sarah",
    name: "Listing inquiries",
    image: sarahImg,
  },
  {
    key: "mike",
    name: "Service inquiries",
    image: mikeImg,
  },
  {
    key: "jessica",
    name: "Reception questions",
    image: jessicaImg,
  },
  {
    key: "carlos",
    name: "B2B prospecting",
    image: carlosImg,
  },
];

const TestimonialSection = () => {
  const { t: tr } = useTranslation();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((c) => (c + 1) % testimonials.length);
  }, []);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((c) => (c - 1 + testimonials.length) % testimonials.length);
  }, []);

  useEffect(() => {
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [next]);

  const active = testimonials[current];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -120 : 120, opacity: 0 }),
  };

  return (
    <section id="testimonials" className="py-16 sm:py-24 relative overflow-hidden">
      {/* subtle background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
            <span className="text-foreground">{tr("testimonials.title1")}</span>
            <span className="text-gradient-primary">{tr("testimonials.title2")}</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            {tr("testimonials.sub")}
          </p>
        </motion.div>

        {/* Carousel card */}
        <div className="max-w-3xl mx-auto relative">
          {/* Nav arrows */}
          <button
            onClick={prev}
            aria-label={tr("testimonials.previous")}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-12 z-20 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            aria-label={tr("testimonials.next")}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-12 z-20 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-6 sm:p-10"
            >
              <Quote className="w-8 h-8 text-primary/30 mb-4" />

              <p className="text-center text-xs font-semibold text-primary mb-5">Illustrative scenario · not a customer endorsement</p>

              <blockquote className="text-lg sm:text-xl font-medium leading-relaxed mb-8 text-foreground text-center">
                "{tr(`testimonials.items.${active.key}.quote`)}"
              </blockquote>

              <div className="flex items-center justify-center gap-4">
                <img
                  src={active.image}
                  alt={active.name}
                  loading="lazy"
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-full object-cover border-2 border-primary/30"
                />
                <div className="text-left">
                  <p className="font-semibold text-foreground">{active.name}</p>
                  <p className="text-sm text-muted-foreground">{tr(`testimonials.items.${active.key}.title`)}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setDirection(i > current ? 1 : -1);
                  setCurrent(i);
                }}
                aria-label={tr("testimonials.goTo", { number: i + 1 })}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === current
                    ? "bg-primary w-6"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Small avatar row showing all faces */}
        <div className="flex justify-center items-center gap-3 mt-8">
          {testimonials.map((person, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > current ? 1 : -1);
                setCurrent(i);
              }}
              className={`transition-all ${
                i === current
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full scale-110"
                  : "opacity-50 hover:opacity-80"
              }`}
            >
              <img
                src={person.image}
                alt={person.name}
                loading="lazy"
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
