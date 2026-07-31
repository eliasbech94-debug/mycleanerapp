import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Sparkles, Calendar, MapPin, Clock } from "lucide-react";
import { serviceCategories, countries, formatPrice } from "@/lib/countries";
import { useTranslation } from "react-i18next";

const CreateTask = () => {
  const { t } = useTranslation("marketplace");
  const [form, setForm] = useState({
    category: "", subcategory: "", description: "",
    address: "", postalCode: "", city: "", country: "DK",
    preferredDate: "", preferredTime: "flexible",
    urgency: "normal",
  });
  const [showEstimate, setShowEstimate] = useState(false);

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));
  const selectedCategory = serviceCategories.find((c) => c.id === form.category);
  const country = countries.find((c) => c.code === form.country) || countries[0];

  const aiEstimate = {
    low: country.minHourlyRate * 2,
    mid: country.minHourlyRate * 3,
    high: country.minHourlyRate * 4.5,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container-narrow py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-3xl font-bold mb-2">{t("surfaces.createTask.heading")}</h1>
            <p className="text-muted-foreground">{t("surfaces.createTask.subheading")}</p>
          </div>

          <div className="glass-card p-6 md:p-8 space-y-6">
            <div>
              <Label>{t("surfaces.createTask.categoryLabel")}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {serviceCategories.map((cat) => (
                  <button key={cat.id} onClick={() => { update("category", cat.id); update("subcategory", ""); }}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${form.category === cat.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <span className="text-2xl block mb-1">{cat.icon}</span>
                    <span className="text-xs font-medium">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedCategory && (
              <div>
                <Label>{t("surfaces.createTask.subcategoryLabel")}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedCategory.subcategories.map((sub) => (
                    <button key={sub} onClick={() => update("subcategory", sub)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${form.subcategory === sub ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>{t("surfaces.createTask.descriptionLabel")}</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)}
                placeholder={t("surfaces.createTask.descriptionPlaceholder")}
                className="min-h-[120px] mt-2" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("surfaces.createTask.addressLabel")}</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label>{t("surfaces.createTask.countryLabel")}</Label>
                <Select value={form.country} onValueChange={(v) => update("country", v)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>{countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {t("surfaces.createTask.preferredDateLabel")}</Label>
                <Input type="date" value={form.preferredDate} onChange={(e) => update("preferredDate", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {t("surfaces.createTask.preferredTimeLabel")}</Label>
                <Select value={form.preferredTime} onValueChange={(v) => update("preferredTime", v)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible">{t("surfaces.createTask.time.flexible")}</SelectItem>
                    <SelectItem value="morning">{t("surfaces.createTask.time.morning")}</SelectItem>
                    <SelectItem value="afternoon">{t("surfaces.createTask.time.afternoon")}</SelectItem>
                    <SelectItem value="evening">{t("surfaces.createTask.time.evening")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("surfaces.createTask.priorityLabel")}</Label>
                <Select value={form.urgency} onValueChange={(v) => update("urgency", v)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t("surfaces.createTask.priority.normal")}</SelectItem>
                    <SelectItem value="urgent">{t("surfaces.createTask.priority.urgent")}</SelectItem>
                    <SelectItem value="flexible">{t("surfaces.createTask.priority.flexible")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.category && form.description.length > 10 && (
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-heading font-semibold">{t("surfaces.createTask.estimate.heading")}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-background">
                    <div className="text-xs text-muted-foreground mb-1">{t("surfaces.createTask.estimate.from")}</div>
                    <div className="font-heading font-bold text-lg">{formatPrice(aiEstimate.low, country)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-background ring-2 ring-primary">
                    <div className="text-xs text-primary font-medium mb-1">{t("surfaces.createTask.estimate.recommended")}</div>
                    <div className="font-heading font-bold text-lg text-primary">{formatPrice(aiEstimate.mid, country)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-background">
                    <div className="text-xs text-muted-foreground mb-1">{t("surfaces.createTask.estimate.to")}</div>
                    <div className="font-heading font-bold text-lg">{formatPrice(aiEstimate.high, country)}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {t("surfaces.createTask.estimate.basis", {
                    agreement: country.laborAgreement,
                    symbol: country.currencySymbol,
                    rate: country.minHourlyRate,
                    vat: country.vatRate * 100,
                  })}
                </p>
              </div>
            )}

            <Button className="w-full h-12 text-base" size="lg">
              {t("surfaces.createTask.submit")} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTask;
