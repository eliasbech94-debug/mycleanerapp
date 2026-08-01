/**
 * PrefixedNavigate — <Navigate> that preserves the active market prefix.
 *
 * Use for every internal redirect so /dk/customer/notifications lands on
 * /dk/profil?tab=inbox instead of dropping the user out of the localised
 * URL space (which produced dead links and 404s on refresh).
 */
import { Navigate } from "react-router-dom";
import { useCountryPath } from "@/lib/countryPath";

export default function PrefixedNavigate({
  to,
  replace = true,
}: {
  to: string;
  replace?: boolean;
}) {
  const localize = useCountryPath();
  const [path, search] = to.split("?");
  return <Navigate to={`${localize(path)}${search ? `?${search}` : ""}`} replace={replace} />;
}
