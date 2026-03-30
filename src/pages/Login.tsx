import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="gradient-hero rounded-xl w-10 h-10 flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold text-xl">H</span>
            </div>
          </Link>
          <h1 className="font-heading text-2xl font-bold">Velkommen tilbage</h1>
          <p className="text-muted-foreground text-sm mt-1">Log ind for at fortsætte</p>
        </div>

        <div className="glass-card p-6">
          <Tabs defaultValue="customer">
            <TabsList className="grid grid-cols-3 w-full mb-6">
              <TabsTrigger value="customer">Kunde</TabsTrigger>
              <TabsTrigger value="provider">Provider</TabsTrigger>
              <TabsTrigger value="employee">Medarbejder</TabsTrigger>
            </TabsList>
            {["customer", "provider", "employee"].map((role) => (
              <TabsContent key={role} value={role} className="space-y-4">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Adgangskode</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button className="w-full">Log ind <ArrowRight className="h-4 w-4 ml-2" /></Button>
                <p className="text-center text-sm text-muted-foreground">
                  <a href="#" className="text-primary hover:underline">Glemt adgangskode?</a>
                </p>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Har du ikke en konto? <Link to="/customer/register" className="text-primary hover:underline font-medium">Opret dig her</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
