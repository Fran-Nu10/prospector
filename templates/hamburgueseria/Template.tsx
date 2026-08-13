import type { ClientData } from "../../web/lib/schema";
import Nav from "./Nav";
import Hero from "./Hero";
import Firma from "./Firma";
import MenuSeccion from "./MenuSeccion";
import Historia from "./Historia";
import Resenas from "./Resenas";
import Galeria from "./Galeria";
import ComoPedir from "./ComoPedir";
import Horarios from "./Horarios";
import PieDePagina from "./PieDePagina";
import { itemDestacado } from "./menu";
import { numeral } from "./tipografia";

/*
 * Plantilla `hamburgueseria` — póster punk nocturno (ver DESIGN.md).
 *
 * Renderiza EXCLUSIVAMENTE desde `data`: nada del negocio vive acá. Lo único
 * hardcodeado son los rótulos de la plantilla (los nombres de las secciones y
 * el despiece de la burger genérica, que es un asset del vertical).
 *
 * LA COMPOSICIÓN, en orden, y por qué ese orden:
 *
 *   01 Hero      denso    el nombre sangrando contra los dos bordes
 *   02 La firma  denso    el despiece — el momento estrella
 *   03 Menú      denso    la grilla asimétrica
 *   04 Historia  VACÍO    el respiro; sin él la página no tiene ritmo
 *   05 Reseñas   medio
 *   06 Galería   imagen
 *   07 Cómo pedir medio
 *   08 Horarios  datos
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
    "firma",
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

      <Hero data={data} numero={numeral(numero("hero"))} hrefPedido={hrefPedido} />

      <Firma numero={numero("firma")} destacado={itemDestacado(menu)} />

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

      {/* Botón de pedidos fijo (mobile-first: siempre a mano). El borde negro
          lo despega del nombre en brasa del footer, que pasa por debajo. */}
      {hrefPedido && (
        <a
          href={hrefPedido}
          aria-label="Pedir por WhatsApp"
          className="fixed bottom-20 right-20 z-50 rounded-button border border-negro bg-brasa px-24 py-16 text-body-sm font-bold text-hueso"
        >
          Pedir por WhatsApp
        </a>
      )}
    </div>
  );
}
