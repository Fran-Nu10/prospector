import type { ClientData } from "../../web/lib/schema";
import BurgerScroll from "./BurgerScroll";
import MenuSeccion from "./MenuSeccion";
import { RevelarBloque, RevelarLineas } from "./RevelarLineas";
import SeccionTitulo from "./SeccionTitulo";
import CardViva from "./CardViva";
import Resenas from "./Resenas";
import Galeria from "./Galeria";
import ComoPedir from "./ComoPedir";
import { delayStagger } from "./animacion";

/*
 * Plantilla `hamburgueseria` — póster punk nocturno (ver DESIGN.md).
 * Renderiza EXCLUSIVAMENTE desde `data`: nada del negocio vive acá.
 * Sistema plano: sin sombras, sin glows, sin gradientes — la única
 * excepción es el "borde vivo" de las cards del menú (ver MenuSeccion).
 */

function waHref(whatsapp: string) {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}

export default function Template({ data }: { data: ClientData }) {
  const { hero, menu, hours, gallery, highlights, reviews, ordering } = data;

  return (
    <div className="min-h-screen bg-noche font-body text-hueso">
      {/* ===== Nav — barra negra sólida, ancla visual ===== */}
      <header className="sticky top-0 z-40 bg-negro">
        <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-20 py-16">
          <a
            href="#"
            className="text-body-sm font-bold uppercase tracking-[0.18em]"
          >
            {data.name}
          </a>
          <div className="flex items-center gap-24">
            {menu && menu.length > 0 && (
              <a
                href="#menu"
                className="text-body-sm font-medium text-hueso hover:text-rescoldo"
              >
                Menú
              </a>
            )}
            {hours && hours.length > 0 && (
              <a
                href="#horarios"
                className="hidden text-body-sm font-medium text-hueso hover:text-rescoldo sm:block"
              >
                Horarios
              </a>
            )}
            {data.whatsapp && (
              <a
                href={waHref(data.whatsapp)}
                className="rounded-button bg-brasa px-16 py-8 text-body-sm font-bold text-hueso"
              >
                Pedir
              </a>
            )}
          </div>
        </nav>
      </header>

      {/* ===== Hero — el cartel gritado =====
          Sin padding inferior a propósito: el track de la burger ya termina
          justo donde arranca "La historia", y cualquier padding acá se lee
          como un vacío negro entre las dos secciones. */}
      <section className="mx-auto max-w-[1280px] px-20 pt-56 md:pt-80">
        <div className="grid gap-56 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          {/* En desktop el texto queda pegado mientras el track de la
              burger scrollea al lado; en mobile fluye normal.
              El texto entra línea por línea al cargar (ver RevelarLineas):
              cascada corta y discreta — la estrella del hero es la burger. */}
          <div className="lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-center">
            {data.tagline && (
              <RevelarLineas
                texto={data.tagline}
                retraso={0.04}
                className="text-body-sm font-medium uppercase tracking-[0.22em] text-rescoldo"
              />
            )}
            <RevelarLineas
              as="h1"
              texto={data.name}
              retraso={0.1}
              desplazamiento={18}
              className="mt-24 break-words font-display uppercase leading-display tracking-display text-brasa text-[clamp(64px,13vw,160px)] md:mt-32"
            />
            {hero?.heading && (
              <RevelarLineas
                texto={hero.heading}
                retraso={0.24}
                desplazamiento={16}
                className="mt-32 font-display uppercase leading-heading-lg text-hueso text-[clamp(40px,5.5vw,72px)] md:mt-40"
              />
            )}
            {hero?.sub && (
              <RevelarLineas
                texto={hero.sub}
                retraso={0.38}
                className="mt-24 max-w-[520px] text-body leading-body text-rescoldo"
              />
            )}
            <RevelarBloque
              retraso={0.46}
              className="mt-40 flex flex-wrap items-center gap-24"
            >
              {data.whatsapp && (
                <a
                  href={waHref(data.whatsapp)}
                  className="rounded-button bg-brasa px-32 py-16 text-body font-bold text-hueso"
                >
                  Pedir por WhatsApp
                </a>
              )}
              {menu && menu.length > 0 && (
                <a
                  href="#menu"
                  className="text-body font-medium text-rescoldo underline underline-offset-4 hover:text-hueso"
                >
                  Ver el menú
                </a>
              )}
            </RevelarBloque>
          </div>

          {/* Construcción de la burger por scroll (ver BurgerScroll.tsx) */}
          <BurgerScroll />
        </div>
      </section>

      {/* ===== Historia =====
          El padding superior es el único respiro entre la burger ya armada y
          esta sección: se mantiene corto para que no se lea como vacío. */}
      {data.about && (
        <section className="bg-carbon pb-80 pt-56 md:pb-100 md:pt-64">
          <div className="mx-auto max-w-[1280px] px-20">
            {/* Editorial a dos columnas: el título pesa a la izquierda y el
                relato respira a la derecha. En mobile apila. */}
            <div className="grid gap-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-56">
              <SeccionTitulo
                eyebrow="La historia"
                titulo="De dónde sale esta burger"
              />
              <RevelarLineas
                enVista
                texto={data.about}
                retraso={0.32}
                paso={0.08}
                desplazamiento={18}
                /* Alineado al pie del titular: recurso editorial, evita que el
                   relato flote solo arriba a la derecha. */
                className="text-subheading leading-subheading text-hueso lg:self-end lg:pb-8"
              />
            </div>

            {/* Datos duros — solo si el prospecto los tiene cargados. */}
            {highlights && highlights.length > 0 && (
              <dl className="mt-56 grid grid-cols-2 gap-x-24 gap-y-32 border-t border-negro pt-40 md:grid-cols-3 md:mt-64">
                {highlights.map((h, i) => (
                  <RevelarBloque
                    key={`${h.value}-${h.label}`}
                    enVista
                    retraso={delayStagger(i)}
                  >
                    <dt className="font-display uppercase leading-heading text-brasa text-[clamp(40px,5vw,64px)]">
                      {h.value}
                    </dt>
                    <dd className="mt-8 font-mono text-body-sm uppercase tracking-[0.18em] text-rescoldo">
                      {h.label}
                    </dd>
                  </RevelarBloque>
                ))}
              </dl>
            )}
          </div>
        </section>
      )}

      {/* ===== Menú — sección estrella (ver MenuSeccion.tsx) ===== */}
      {menu && menu.length > 0 && <MenuSeccion menu={menu} />}

      {/* ===== Reseñas — prueba social (ver Resenas.tsx) ===== */}
      {reviews && reviews.length > 0 && (
        <Resenas
          reviews={reviews}
          rating={data._meta?.rating}
          reviewCount={data._meta?.reviewCount}
        />
      )}

      {/* ===== Galería / ambiente (ver Galeria.tsx) ===== */}
      {gallery && gallery.length > 0 && (
        <Galeria gallery={gallery} nombre={data.name} />
      )}

      {/* ===== Cómo pedir (ver ComoPedir.tsx) ===== */}
      {ordering && ordering.steps.length > 0 && (
        <ComoPedir
          steps={ordering.steps}
          note={ordering.note}
          whatsapp={data.whatsapp}
        />
      )}

      {/* ===== Horarios + ubicación ===== */}
      {(hours?.length || data.address || data.phone || data.mapsUrl) && (
        <section id="horarios" className="scroll-mt-64 py-80 md:py-100">
          <div className="mx-auto max-w-[1280px] px-20">
            <SeccionTitulo eyebrow="Cuándo y dónde" titulo="Horarios y ubicación" />
          </div>
          {/* Las dos cards hablan el mismo idioma que las del menú:
              entrada con stagger, lift y borde vivo en hover. */}
          <div className="mx-auto mt-40 grid max-w-[1280px] gap-24 px-20 lg:grid-cols-2">
            {hours && hours.length > 0 && (
              <CardViva indice={0}>
                <div className="p-32">
                  <h3 className="font-mono text-body-sm uppercase tracking-[0.22em] text-brasa">
                    Horarios
                  </h3>
                  {/* Ticket de plancha: mono, hairlines, sin adornos. */}
                  <dl className="mt-24">
                    {hours.map((h) => (
                      <div
                        key={h.day}
                        className="flex items-baseline justify-between gap-16 border-b border-negro py-16 font-mono text-body-sm last:border-b-0"
                      >
                        <dt className="font-bold uppercase tracking-[0.08em]">
                          {h.day}
                        </dt>
                        <dd className="text-rescoldo">{h.open}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </CardViva>
            )}
            {(data.address || data.phone || data.mapsUrl || data.instagram) && (
              <CardViva indice={1}>
                <div className="flex h-full flex-col p-32">
                  <h3 className="font-mono text-body-sm uppercase tracking-[0.22em] text-brasa">
                    Dónde estamos
                  </h3>
                  {data.address && (
                    <p className="mt-24 max-w-[380px] text-subheading leading-subheading text-hueso">
                      {data.address}
                    </p>
                  )}
                  <div className="mt-24 flex flex-wrap items-center gap-x-24 gap-y-8 font-mono text-body-sm text-rescoldo">
                    {data.phone && <span>{data.phone}</span>}
                    {data.instagram && (
                      <a
                        href={`https://instagram.com/${data.instagram.replace(/^@/, "")}`}
                        className="underline underline-offset-4 transition-colors hover:text-hueso"
                      >
                        {data.instagram}
                      </a>
                    )}
                  </div>
                  {data.mapsUrl && (
                    /* mt-auto pega la acción al piso de la card; el pt-32
                       garantiza aire aunque la dirección sea corta. */
                    <div className="mt-auto pt-32">
                      <a
                        href={data.mapsUrl}
                        className="inline-block rounded-button bg-brasa px-24 py-12 text-body-sm font-bold text-hueso"
                      >
                        Cómo llegar
                      </a>
                    </div>
                  )}
                </div>
              </CardViva>
            )}
          </div>
        </section>
      )}

      {/* ===== Footer — cierre, no pie de página ===== */}
      {/* pb generoso: el botón fijo de WhatsApp flota sobre el fondo de la
          página y taparía la última línea del footer. */}
      <footer className="bg-negro pb-100 pt-80 md:pt-100">
        <div className="mx-auto max-w-[1280px] px-20">
          {/* El nombre gigante cierra igual que abrió el hero. */}
          <RevelarLineas
            enVista
            texto={data.name}
            desplazamiento={18}
            className="break-words font-display uppercase leading-heading-lg text-brasa text-[clamp(48px,7vw,103px)]"
          />

          {data.whatsapp && (
            <RevelarBloque enVista retraso={0.14} className="mt-40">
              <a
                href={waHref(data.whatsapp)}
                className="inline-block rounded-button bg-brasa px-32 py-16 text-body font-bold text-hueso"
              >
                Pedir por WhatsApp
              </a>
            </RevelarBloque>
          )}

          {/* Tres columnas con hairlines — separación por bloques, sin sombras. */}
          <div className="mt-64 grid gap-32 border-t border-carbon pt-40 md:grid-cols-3">
            {(data.address || data.phone) && (
              <RevelarBloque enVista retraso={delayStagger(0)}>
                <h2 className="font-mono text-caption uppercase tracking-[0.22em] text-brasa">
                  Contacto
                </h2>
                {data.address && (
                  <p className="mt-16 text-body leading-body text-hueso">
                    {data.address}
                  </p>
                )}
                {data.phone && (
                  <p className="mt-8 font-mono text-body-sm text-rescoldo">
                    {data.phone}
                  </p>
                )}
              </RevelarBloque>
            )}

            {hours && hours.length > 0 && (
              <RevelarBloque enVista retraso={delayStagger(1)}>
                <h2 className="font-mono text-caption uppercase tracking-[0.22em] text-brasa">
                  Horarios
                </h2>
                <dl className="mt-16 font-mono text-body-sm">
                  {hours.map((h) => (
                    <div key={h.day} className="flex justify-between gap-16 py-4">
                      <dt className="text-hueso">{h.day}</dt>
                      <dd className="text-rescoldo">{h.open}</dd>
                    </div>
                  ))}
                </dl>
              </RevelarBloque>
            )}

            <RevelarBloque enVista retraso={delayStagger(2)}>
              <h2 className="font-mono text-caption uppercase tracking-[0.22em] text-brasa">
                Seguinos
              </h2>
              <ul className="mt-16 flex flex-col items-start gap-8 text-body-sm">
                {data.instagram && (
                  <li>
                    <a
                      href={`https://instagram.com/${data.instagram.replace(/^@/, "")}`}
                      className="text-hueso transition-colors hover:text-brasa"
                    >
                      {data.instagram}
                    </a>
                  </li>
                )}
                {data.mapsUrl && (
                  <li>
                    <a
                      href={data.mapsUrl}
                      className="text-hueso transition-colors hover:text-brasa"
                    >
                      Cómo llegar
                    </a>
                  </li>
                )}
                {menu && menu.length > 0 && (
                  <li>
                    <a
                      href="#menu"
                      className="text-hueso transition-colors hover:text-brasa"
                    >
                      Ver el menú
                    </a>
                  </li>
                )}
              </ul>
            </RevelarBloque>
          </div>

          <div className="mt-56 flex flex-wrap items-center justify-between gap-16 border-t border-carbon pt-24 font-mono text-caption uppercase tracking-[0.14em] text-rescoldo">
            <span>{data.name}</span>
            <span>Montevideo, Uruguay</span>
          </div>
        </div>
      </footer>

      {/* Botón de pedidos fijo (mobile-first: siempre a mano) */}
      {data.whatsapp && (
        <a
          href={waHref(data.whatsapp)}
          aria-label="Pedir por WhatsApp"
          className="fixed bottom-20 right-20 z-50 rounded-button bg-brasa px-24 py-16 text-body-sm font-bold text-hueso"
        >
          Pedir por WhatsApp
        </a>
      )}
    </div>
  );
}
