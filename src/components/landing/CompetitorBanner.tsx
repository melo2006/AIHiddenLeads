import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

const CompetitorBanner = () => {
  return (
    <section className="py-10 sm:py-14 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-destructive/5 via-background to-destructive/5" />
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-destructive/30 bg-destructive/10 mb-6">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Reality Check</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            While You Read This, Your Competitor Just Answered a Call
            <span className="text-destructive"> You Missed</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mt-10">
            {[
              { stat: "67%", text: "of customers hang up if they can't reach a real person" },
              { stat: "85%", text: "of callers who hit voicemail don't call back" },
              { stat: "0.4s", text: "average AI response time vs 4+ hours for humans" },
            ].map((item, i) => (
              <motion.div
                key={item.text}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <p className="text-3xl font-bold text-foreground mb-2">{item.stat}</p>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CompetitorBanner;
