import type { ClientData } from "../../web/lib/schema";
import type { FuenteCatalogo } from "../../web/lib/ecommerce/vistas";
import Nav from "./Nav";
import HeroExperience from "./HeroExperience";
import MenuSeccion from "./MenuSeccion";
import PlanchaViva from "./PlanchaViva";
import Historia from "./Historia";
import Resenas from "./Resenas";
import Galeria from "./Galeria";
import ComoPedir from "./ComoPedir";
import Horarios from "./Horarios";
import PieDePagina from "./PieDePagina";
import TiendaProvider from "./ecommerce/TiendaProvider";
import AvisoAgregado from "./ecommerce/AvisoAgregado";
import BotonCarrito from "./ecommerce/BotonCarrito";
import CarritoHoja from "./ecommerce/CarritoHoja";
import ProductoHoja from "./ecommerce/ProductoHoja";
import { destacadoDeCatalogo } from "./menu";

/*
 * Plantilla `hamburgueseria` — póster punk nocturno (ver DESIGN.md).
 *
 * Renderiza EXCLUSIVAMENTE desde `data`: nada del negocio vive acá. Lo único
 * hardcodeado son los rótulos de la plantilla (los nombres de las secciones y
 * el despiece de la burger genérica, que es un asset del vertical).
 *
 * LA COMPOSICIÓN, en orden, y por qué ese orden:
 *
 *   01 Hero          denso    el póster que se abre — el momento estrella
 *   02 Menú          denso    el carrusel de productos
 *   03 Plancha viva  denso    la ventana de video que se abre — segundo pico
 *   04 Historia      VACÍO    el respiro; sin él la página no tiene ritmo
 *   05 Reseñas       medio
 *   06 Galería       imagen
 *   07 Cómo pedir    medio
 *   08 Horarios      datos
 *
 * OJO con el orden: "Acompañamientos" NO es una sección, es una categoría más
 * dentro de `MenuSeccion` —comparte el `<section id="menu">` con el carrusel—,
 * así que Plancha viva no puede intercalarse entre ambas sin partir el menú.
 * Va después del bloque de menú completo.
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

export default function Template({
  data,
  fuente,
}: {
  data: ClientData;
  /**
   * El catálogo, resuelto en el servidor. En modo `ecommerce` la página vende;
   * en modo `carta` se ve igual y el pedido sigue saliendo por WhatsApp. La
   * plantilla NO lee `data.menu`: la única fuente del menú es esta.
   */
  fuente: FuenteCatalogo;
}) {
  const { hours, gallery, reviews, ordering } = data;

  const hrefPedido = data.whatsapp ? waHref(data.whatsapp) : undefined;

  const tieneMenu =
    fuente.modo === "carta"
      ? fuente.secciones.length > 0
      : fuente.productos.length > 0;
  const tienePlancha = Boolean(data.planchaViva?.headline);
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
    tienePlancha && "plancha",
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
    <TiendaProvider fuente={fuente} slug={data.slug}>
      <div className="min-h-screen overflow-x-clip bg-noche font-body text-hueso">
        <Nav
          data={data}
          hrefPedido={hrefPedido}
          tieneMenu={tieneMenu}
          tieneHorarios={tieneHorarios}
          carrito={<BotonCarrito />}
        />

        <HeroExperience
          data={data}
          numero={numero("hero")}
          hrefPedido={hrefPedido}
          destacado={destacadoDeCatalogo(fuente)}
        />

        {tieneMenu && (
          <MenuSeccion numero={numero("menu")} whatsapp={data.whatsapp} />
        )}

        {/* Va inmediatamente después del menú: es el segundo pico visual y
            necesita el ancho completo del viewport, así que no puede vivir
            dentro de la sección del menú (ver nota de composición arriba). */}
        {tienePlancha && data.planchaViva && (
          <PlanchaViva
            plancha={data.planchaViva}
            numero={numero("plancha")}
            hrefPedido={hrefPedido}
          />
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

        {/* Las dos superficies del ecommerce. Se montan una sola vez, fuera del
            flujo: viven en un portal y solo existen cuando están abiertas. */}
        <ProductoHoja />
        <CarritoHoja />
        <AvisoAgregado />
      </div>
    </TiendaProvider>
  );
}
