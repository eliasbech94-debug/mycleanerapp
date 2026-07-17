import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";
import { Loader2, Plus, X, Home, Save } from "lucide-react";

type Room = { name: string; tasks: { label: string; checked: boolean }[] };

const DEFAULT_ROOMS: Room[] = [
  { name: "Køkken", tasks: [
    { label: "Aftør borde og skabslåger", checked: true },
    { label: "Rengør vask og armatur", checked: true },
    { label: "Gulv støvsuges og vaskes", checked: true },
  ]},
  { name: "Badeværelse", tasks: [
    { label: "Toilet, vask og bruser", checked: true },
    { label: "Spejle og armaturer", checked: true },
    { label: "Gulv og fuger", checked: true },
  ]},
  { name: "Stue", tasks: [
    { label: "Støv af overflader", checked: true },
    { label: "Støvsug møbler og gulv", checked: true },
  ]},
  { name: "Sovværelse", tasks: [
    { label: "Redning af seng", checked: false },
    { label: "Støv af og støvsug", checked: true },
  ]},
];

const FOCUS_TAGS = [
  "Ovn indvendigt", "Køleskab indvendigt", "Vinduer", "Kæledyrshår",
  "Fuger", "Skabe indvendigt", "Sengelinned skiftes", "Vasketøj",
  "Terrasse/altan", "Skraldespand rengøres",
];

export default function BookingPlan() {
  const { id: bookingId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [focus, setFocus] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"booking" | "property">("booking");
  const [newRoomName, setNewRoomName] = useState("");
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !bookingId) return;
      const { data: b } = await supabase
        .from("bookings").select("*")
        .eq("id", bookingId).eq("customer_user_id", user.id).maybeSingle();
      if (cancelled) return;
      setBooking(b);

      // find matching address
      let addr: any = null;
      if (b?.address_place_id) {
        const { data } = await supabase.from("customer_addresses")
          .select("*").eq("user_id", user.id).eq("address_place_id", b.address_place_id).maybeSingle();
        addr = data;
      }
      if (!addr) {
        const { data } = await supabase.from("customer_addresses")
          .select("*").eq("user_id", user.id).eq("is_primary", true).maybeSingle();
        addr = data;
      }
      setAddress(addr);

      // existing plan (booking or property)
      const { data: existing } = await supabase.from("cleaning_plans")
        .select("*").eq("user_id", user.id)
        .or(`booking_id.eq.${bookingId}${addr ? `,address_id.eq.${addr.id}` : ""}`)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (existing) {
        setRooms((existing.rooms as any) || DEFAULT_ROOMS);
        setFocus((existing.focus_areas as any) || []);
        setNotes(existing.notes || "");
        setScope(existing.scope as any);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, bookingId]);

  const providerFirstName = useMemo(
    () => booking?.provider_name?.split(" ")[0] || "din cleaner", [booking]);

  const toggleTask = (ri: number, ti: number) => {
    setRooms(r => r.map((room, i) => i !== ri ? room : {
      ...room, tasks: room.tasks.map((t, j) => j !== ti ? t : { ...t, checked: !t.checked }),
    }));
  };
  const addTask = (ri: number, label: string) => {
    if (!label.trim()) return;
    setRooms(r => r.map((room, i) => i !== ri ? room : {
      ...room, tasks: [...room.tasks, { label: label.trim(), checked: true }],
    }));
  };
  const removeTask = (ri: number, ti: number) => {
    setRooms(r => r.map((room, i) => i !== ri ? room : {
      ...room, tasks: room.tasks.filter((_, j) => j !== ti),
    }));
  };
  const addRoom = () => {
    if (!newRoomName.trim()) return;
    setRooms(r => [...r, { name: newRoomName.trim(), tasks: [] }]);
    setNewRoomName("");
  };
  const removeRoom = (ri: number) => setRooms(r => r.filter((_, i) => i !== ri));
  const toggleFocus = (tag: string) =>
    setFocus(f => f.includes(tag) ? f.filter(t => t !== tag) : [...f, tag]);

  const save = async () => {
    if (!user || !bookingId) return;
    if (scope === "property" && !address) {
      toast.error("Ingen bolig fundet — tilføj en adresse på din profil først.");
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      scope,
      booking_id: scope === "booking" ? bookingId : null,
      address_id: scope === "property" ? address!.id : null,
      rooms,
      focus_areas: focus,
      notes,
    };
    const { error } = await supabase.from("cleaning_plans").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(scope === "booking"
      ? "Rengøringsplan gemt til denne booking"
      : "Fast rengøringsplan gemt på boligen");
    navigate("/mine-bookinger");
  };

  if (loading) {
    return <div className="container-wide py-16 flex justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!booking) {
    return <div className="container-wide py-16"><p>Booking ikke fundet.</p></div>;
  }

  return (
    <main className="container-wide py-8 max-w-3xl">
      <BackButton />
      <div className="mt-4 mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl">Rengøringsplan</h1>
        <p className="mt-2 text-muted-foreground">
          Fortæl {providerFirstName} hvad hun skal fokusere på ved din rengøring den{" "}
          <b>{new Date(booking.booking_date).toLocaleDateString("da-DK")}</b>.
        </p>
      </div>

      <section className="space-y-6">
        {/* Focus tags */}
        <Card className="p-5">
          <h2 className="font-heading text-xl mb-3">Fokusområder</h2>
          <div className="flex flex-wrap gap-2">
            {FOCUS_TAGS.map(tag => (
              <Badge
                key={tag}
                variant={focus.includes(tag) ? "default" : "outline"}
                className="cursor-pointer text-sm py-1.5 px-3"
                onClick={() => toggleFocus(tag)}
              >
                {tag}
              </Badge>
            ))}
            {focus.filter(t => !FOCUS_TAGS.includes(t)).map(tag => (
              <Badge key={tag} variant="default" className="cursor-pointer text-sm py-1.5 px-3"
                onClick={() => toggleFocus(tag)}>
                {tag} <X className="ml-1 h-3 w-3" />
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Tilføj eget fokus..." value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (customTag.trim()) { setFocus(f => [...f, customTag.trim()]); setCustomTag(""); } } }} />
            <Button type="button" variant="outline" onClick={() => {
              if (customTag.trim()) { setFocus(f => [...f, customTag.trim()]); setCustomTag(""); }
            }}><Plus className="h-4 w-4" /></Button>
          </div>
        </Card>

        {/* Rooms */}
        <Card className="p-5">
          <h2 className="font-heading text-xl mb-3">Rum og opgaver</h2>
          <div className="space-y-5">
            {rooms.map((room, ri) => (
              <RoomBlock key={ri} room={room} onToggle={ti => toggleTask(ri, ti)}
                onAdd={label => addTask(ri, label)}
                onRemove={ti => removeTask(ri, ti)}
                onRemoveRoom={() => removeRoom(ri)} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Input placeholder="Tilføj rum (fx Entré, Bryggers)"
              value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRoom(); } }} />
            <Button type="button" variant="outline" onClick={addRoom}><Plus className="h-4 w-4" /></Button>
          </div>
        </Card>

        {/* Notes */}
        <Card className="p-5">
          <h2 className="font-heading text-xl mb-3">Noter til cleaneren</h2>
          <Textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Fx: nøglen ligger under måtten, hund er hjemme, brug parfumefri produkter..." />
        </Card>

        {/* Save mode */}
        <Card className="p-5">
          <h2 className="font-heading text-xl mb-3">Sådan vil du gemme</h2>
          <RadioGroup value={scope} onValueChange={v => setScope(v as any)} className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border p-3 hover:bg-muted/40">
              <RadioGroupItem value="booking" id="s-booking" className="mt-1" />
              <div>
                <div className="font-medium flex items-center gap-2"><Save className="h-4 w-4" /> Kun til denne rengøring</div>
                <div className="text-sm text-muted-foreground">Gælder kun bookingen den {new Date(booking.booking_date).toLocaleDateString("da-DK")}.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border p-3 hover:bg-muted/40">
              <RadioGroupItem value="property" id="s-property" className="mt-1" disabled={!address} />
              <div>
                <div className="font-medium flex items-center gap-2"><Home className="h-4 w-4" /> Fast plan på boligen</div>
                <div className="text-sm text-muted-foreground">
                  {address ? <>Genbruges automatisk ved alle fremtidige bookinger på <b>{address.label || address.address}</b>.</>
                    : <>Ingen adresse fundet — tilføj en på din profil for at gemme som fast plan.</>}
                </div>
              </div>
            </label>
          </RadioGroup>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>Annullér</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gem rengøringsplan
          </Button>
        </div>
      </section>
    </main>
  );
}

function RoomBlock({ room, onToggle, onAdd, onRemove, onRemoveRoom }: {
  room: Room; onToggle: (ti: number) => void; onAdd: (label: string) => void;
  onRemove: (ti: number) => void; onRemoveRoom: () => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{room.name}</div>
        <Button variant="ghost" size="sm" onClick={onRemoveRoom}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        {room.tasks.map((t, ti) => (
          <div key={ti} className="flex items-center gap-2 group">
            <Checkbox checked={t.checked} onCheckedChange={() => onToggle(ti)} id={`t-${room.name}-${ti}`} />
            <Label htmlFor={`t-${room.name}-${ti}`} className={`flex-1 cursor-pointer ${!t.checked ? "line-through text-muted-foreground" : ""}`}>
              {t.label}
            </Label>
            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100"
              onClick={() => onRemove(ti)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input placeholder="Tilføj opgave..." value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(val); setVal(""); } }} />
        <Button variant="outline" size="sm" onClick={() => { onAdd(val); setVal(""); }}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
