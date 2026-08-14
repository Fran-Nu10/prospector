import type { ClientData } from "../../web/lib/schema";
import Nav from "./Nav";
import HeroExperience from "./HeroExperience";
import MenuSeccion from "./MenuSeccion";
import Historia from "./Historia";
import Resenas from "./Resenas";
import Galeria from "./Galeria";
import ComoPedir from "./ComoPedir";
import Horarios from "./Horarios";
import PieDePagina from "./PieDePagina";
import { itemDestacado } from "./menu";

/*
 * Plantilla `hamburgueseria` — póster punk nocturno (ver DESIGN.md).
 *
 * Renderiza EXCLUSIVAMENTE desde `data`: nada del negocio vive acá. Lo único
 * hardcodeado son los rótulos de la plantilla (los nombres de las secciones y
 * el despiece de la burger genérica, que es un asset del vertical).
 *
 * LA COMPOSICIÓN, en orden, y por qué ese orden:
 *
 *   01 Hero      denso    el póster que se abre — el momento estrella
 *   02 Menú      denso    la grilla asimétrica
 *   03 Historia  VACÍO    el respiro; sin él la página no tiene ritmo
 *   04 Reseñas   medio
 *   05 Galería   imagen
 *   06 Cómo pedir medio
 *   07 Horarios  datos
 *
 * El hero y el despiece de la burger eran dos secciones separadas y ahora son
 * una sola experiencia continua (ver HeroExperience.tsx): el scroll no cambia
 * de sección, atraviesa la burger y desemboca en el menú.
 *
 * Dos secciones densas seguidas son un error de ritmo: por eso la historia
 * —la más vacía— va inmediatamente después del menú, que es la más cargada.
 *
 * Los numerales de sección NO están escritos en cada componente: se calculan
 * acá según qué trajo el JSON, así una demo sin galería no saltea un número.
 */

function waHref(whatsapp: string) {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}

export default function Template({ data }: { data: ClientData }) {
  const { menu, hours, gallery, reviews, ordering } = data;

  const hrefPedido = data.whatsapp ? waHref(data.whatsapp) : undefined;

  const tieneMenu = Boolean(menu?.length);
  const tieneHistoria = Boolean(data.about || data.highlights?.length);
  const tieneResenas = Boolean(reviews?.length);
  const tieneGaleria = Boolean(gallery?.length);
  const tieneComoPedir = Boolean(ordering?.steps.length);
  const tieneHorarios = Boolean(
    hours?.length || data.address || data.phone || data.mapsUrl
  );

  /* Numeración correlativa de lo que efectivamente se renderiza. */
  const presentes = [
    "hero",
    tieneMenu && "menu",
    tieneHistoria && "historia",
    tieneResenas && "resenas",
    tieneGaleria && "galeria",
    tieneComoPedir && "comoPedir",
    tieneHorarios && "horarios",
  ].filter((s): s is string => Boolean(s));
  const numero = (seccion: string) => presentes.indexOf(seccion) + 1;

  return (
    /* overflow-x clip y no hidden: `hidden` convertiría al contenedor en el
       scroller y rompería los sticky de la nav y de la firma. */
    <div className="min-h-screen overflow-x-clip bg-noche font-body text-hueso">
      <Nav
        data={data}
        hrefPedido={hrefPedido}
        tieneMenu={tieneMenu}
        tieneHorarios={tieneHorarios}
      />

      <HeroExperience
        data={data}
        numero={numero("hero")}
        hrefPedido={hrefPedido}
        destacado={itemDestacado(menu)}
        numeroMenu={tieneMenu ? numero("menu") : undefined}
      />

      {tieneMenu && menu && (
        <MenuSeccion menu={menu} numero={numero("menu")} />
      )}

      {tieneHistoria && <Historia data={data} numero={numero("historia")} />}

      {tieneResenas && reviews && (
        <Resenas
          reviews={reviews}
          rating={data._meta?.rating}
          reviewCount={data._meta?.reviewCount}
          numero={numero("resenas")}
        />
      )}

      {tieneGaleria && gallery && (
        <Galeria
          gallery={gallery}
          nombre={data.name}
          numero={numero("galeria")}
        />
      )}

      {tieneComoPedir && ordering && (
        <ComoPedir
          steps={ordering.steps}
          note={ordering.note}
          whatsapp={data.whatsapp}
          numero={numero("comoPedir")}
        />
      )}

      {tieneHorarios && (
        <Horarios
          data={data}
          numero={numero("horarios")}
          hrefPedido={hrefPedido}
        />
      )}

      <PieDePagina
        data={data}
        hrefPedido={hrefPedido}
        tieneMenu={tieneMenu}
        tieneHorarios={tieneHorarios}
      />

      {/* El botón de pedidos FIJO está fuera de render a propósito: se
          superponía con el CTA de la franja del hero —en mobile directamente
          lo tapaba— y con el nombre en brasa del footer. La acción sigue
          disponible en dos lugares permanentes: el CTA "Pedir" de la nav, que
          es sticky, y el de la franja del hero. Si más adelante se quiere
          recuperar, va con lógica de visibilidad (aparecer solo cuando ni la
          nav ni la franja están en pantalla), no siempre encendido. */}
    </div>
  );
}
