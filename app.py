import streamlit as st
import pandas as pd
import plotly.express as px
from streamlit_plotly_events import plotly_events
from datetime import datetime

# -----------------------------
# CONFIG & STYLE
# -----------------------------
st.set_page_config(
    page_title="À Sombra do Cristo / Under the Christ’s Shadow",
    layout="wide",
)

# Color palette extracted from your palette image
PALETTE = {
    "background": "#f1dfbc",
    "primary": "#f44d1f",
    "secondary": "#516c94",
    "accent_red": "#fb1213",
    "deep_red": "#a31e1f",
    "dark_brown": "#681201",
    "soft_orange": "#f97542",
    "muted_gray": "#625555",
}

# Inject custom fonts + background styling (Roboto; New Cycle is optional & may not load)
st.markdown(
    f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

    html, body, [class*="css"] {{
        font-family: 'Roboto', sans-serif;
        background-color: {PALETTE["background"]};
    }}

    h1, h2, h3, h4, h5, h6 {{
        font-family: 'Roboto', sans-serif;
        color: {PALETTE["dark_brown"]};
    }}

    .names-box {{
        background-color: rgba(255,255,255,0.8);
        border-radius: 8px;
        padding: 0.8rem 1rem;
        border: 1px solid #ddd;
        max-height: 260px;
        overflow-y: auto;
        font-size: 0.9rem;
    }}

    .section-card {{
        background-color: rgba(255,255,255,0.9);
        border-radius: 12px;
        padding: 1.2rem 1.5rem;
        margin-bottom: 1.2rem;
        border: 1px solid #e0d2b5;
    }}

    .small-label {{
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: {PALETTE["muted_gray"]};
    }}
    </style>
    """,
    unsafe_allow_html=True,
)

# -----------------------------
# DATA LOADING & HELPERS
# -----------------------------
@st.cache_data
def load_data():
    df = pd.read_csv("Massacres in Rio de Janeiro 1990-2025 - English.csv")

    # Parse dates
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

    # Year column
    df["Year"] = df["Date"].dt.year

    # Numeric columns
    victim_cols = [
        "Enforced Dissapearances",
        "Victims of State/Police Action",
        "Victims of Faction/Militia Conflict",
        "Police Officers Victims",
        "Total Victimis",
    ]
    for col in victim_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # Unique massacre id
    df["Massacre ID"] = df.index

    # Normalize names
    df["Names"] = df["Names"].fillna("").astype(str)

    return df


def split_names(names_str: str):
    """Return a list of names; default to 'Name not found' if empty."""
    if not isinstance(names_str, str) or not names_str.strip():
        return ["Name not found"]
    # Names are comma-separated
    parts = [n.strip() for n in names_str.split(",") if n.strip()]
    return parts if parts else ["Name not found"]


def get_link_and_text(row, lang):
    """Return link, description, notes based on language."""
    if lang == "pt":
        link = row.get("Link WikiFavelas", "") or row.get("WikiFavelas Source Link", "")
        desc = row.get("Descrição", "")
        notes = row.get("Observações", "")
    else:
        link = row.get("WikiFavelas Source Link", "") or row.get("Link WikiFavelas", "")
        desc = row.get("Description", "")
        notes = row.get("Notes", "")

    link = "" if pd.isna(link) else str(link)
    desc = "" if pd.isna(desc) else str(desc)
    notes = "" if pd.isna(notes) else str(notes)
    return link, desc, notes


def make_map_figure(df_map, lang):
    center_lat = df_map["Latitude"].mean()
    center_lon = df_map["Longitude"].mean()

    hover_title = "Massacre Name" if lang == "en" else "Massacre Name"
    hover_date = "Date"

    fig = px.scatter_mapbox(
        df_map,
        lat="Latitude",
        lon="Longitude",
        size="Total Victimis",
        color="State Governor at the Time",
        hover_name="Massacre Name",
        hover_data={
            "Date": True,
            "Total Victimis": True,
            "State Governor at the Time": True,
            "Latitude": False,
            "Longitude": False,
        },
        zoom=10,
        height=550,
        custom_data=["Massacre ID"],
    )

    fig.update_layout(
        mapbox_style="carto-positron",
        mapbox_center={"lat": center_lat, "lon": center_lon},
        margin={"l": 0, "r": 0, "t": 0, "b": 0},
        legend_title_text="Governor",
    )

    # Custom hover to include link/description/notes via hovertemplate (will be filled client-side by plotly)
    # We already have useful hover_data above; full text will appear in the side panels.
    return fig


def make_bar_figure(df_bar, lang):
    # Prepare long-format for stacked bar
    category_cols = [
        "Enforced Dissapearances",
        "Victims of State/Police Action",
        "Victims of Faction/Militia Conflict",
        "Police Officers Victims",
    ]
    available_cols = [c for c in category_cols if c in df_bar.columns]

    long_cols = ["Massacre ID", "Massacre Name", "Date", "Year"]
    extra_cols = ["WikiFavelas Source Link", "Link WikiFavelas",
                  "Description", "Notes", "Descrição", "Observações"]
    long_cols = [c for c in long_cols if c in df_bar.columns] + [c for c in extra_cols if c in df_bar.columns]

    df_long = df_bar.melt(
        id_vars=long_cols,
        value_vars=available_cols,
        var_name="Category",
        value_name="Victim Count",
    )

    df_long = df_long[df_long["Victim Count"] > 0]

    fig = px.bar(
        df_long,
        x="Date",
        y="Victim Count",
        color="Category",
        custom_data=[
            "Massacre ID",
            "Massacre Name",
            "Date",
            "WikiFavelas Source Link" if "WikiFavelas Source Link" in df_long.columns else "Link WikiFavelas",
            "Description" if lang == "en" else "Descrição",
            "Notes" if lang == "en" else "Observações",
        ],
        height=550,
    )

    fig.update_layout(
        barmode="stack",
        xaxis_title="Ano" if lang == "pt" else "Year",
        yaxis_title="Número de vítimas" if lang == "pt" else "Number of victims",
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
        legend_title_text="Categoria" if lang == "pt" else "Category",
    )

    fig.update_xaxes(
        tickformat="%Y",
        showgrid=True,
    )

    return fig


# -----------------------------
# STATE
# -----------------------------
if "selected_massacre_map" not in st.session_state:
    st.session_state["selected_massacre_map"] = None

if "selected_massacre_bar" not in st.session_state:
    st.session_state["selected_massacre_bar"] = None

# -----------------------------
# MAIN APP
# -----------------------------
df = load_data()

years_available = sorted(df["Year"].dropna().unique().tolist())
year_options = ["All years"] + [str(y) for y in years_available]

# ---- Top: LANG + TITLES ----
header_col, lang_col = st.columns([4, 1])

with lang_col:
    lang = st.radio(
        "Idioma / Language",
        options=["pt", "en"],
        format_func=lambda x: "Português" if x == "pt" else "English",
    )

with header_col:
    if lang == "pt":
        st.markdown("### À Sombra do Cristo")
        st.markdown("**Arquivo público e colaborativo das vítimas de violência no Rio**")
    else:
        st.markdown("### Under the Christ’s Shadow")
        st.markdown("**A public, collaborative archive of Rio’s victims of violence**")

st.markdown("")  # small spacing

# ---- GLOBAL FILTERS (YEAR) ----
with st.container():
    st.markdown('<div class="section-card">', unsafe_allow_html=True)
    st.markdown(
        '<span class="small-label">Filtro temporal / Time filter</span>',
        unsafe_allow_html=True,
    )

    filter_col1, _ = st.columns([2, 3])
    with filter_col1:
        selected_year_label = st.selectbox(
            "Ano / Year",
            options=year_options,
            index=0,
        )

    if selected_year_label == "All years":
        df_filtered = df.copy()
    else:
        selected_year = int(selected_year_label)
        df_filtered = df[df["Year"] == selected_year].copy()

    st.markdown("</div>", unsafe_allow_html=True)

# -----------------------------
# MAP SECTION
# -----------------------------
st.markdown('<div class="section-card">', unsafe_allow_html=True)
if lang == "pt":
    st.subheader("Mapa de massacres na Região Metropolitana do Rio")
    st.markdown(
        "Cada ponto representa um massacre. O tamanho indica o número total de vítimas; a cor indica o governador no período."
    )
else:
    st.subheader("Map of massacres in Rio’s metropolitan area")
    st.markdown(
        "Each point represents a massacre. Point size shows total victims; color shows the governor at the time."
    )

map_col, side_col = st.columns([3, 1])

# ---- Map ----
with map_col:
    if df_filtered.empty or df_filtered["Latitude"].isna().all():
        st.warning("No data available for the selected year.")
        map_selected = None
    else:
        fig_map = make_map_figure(df_filtered, lang=lang)
        map_selected_points = plotly_events(
            fig_map,
            click_event=True,
            hover_event=False,
            override_height=550,
            key="map",
        )

        map_selected = None
        if map_selected_points:
            # customdata is [Massacre ID]
            cd = map_selected_points[0].get("customdata", None)
            if cd is not None:
                map_selected = cd[0] if isinstance(cd, list) else cd
                st.session_state["selected_massacre_map"] = map_selected

        st.plotly_chart(fig_map, use_container_width=True)

# ---- Side window: names for selected MAP massacre ----
with side_col:
    if lang == "pt":
        st.markdown("##### Vítimas (clique em um ponto)")
    else:
        st.markdown("##### Victims (click a point)")

    sel_id = st.session_state.get("selected_massacre_map", None)
    if sel_id is None:
        if lang == "pt":
            st.info("Clique em um ponto no mapa para ver os nomes.")
        else:
            st.info("Click a point on the map to see the names.")
    else:
        row = df_filtered.loc[df_filtered["Massacre ID"] == sel_id]
        if row.empty:
            st.info("Massacre não encontrado." if lang == "pt" else "Massacre not found.")
        else:
            row = row.iloc[0]
            names_list = split_names(row["Names"])
            link, desc, notes = get_link_and_text(row, lang)

            st.markdown(
                f"**{row['Massacre Name']}**  \n"
                f"{row['Date'].strftime('%d/%m/%Y') if pd.notna(row['Date']) else ''}"
            )
            st.markdown('<div class="names-box">', unsafe_allow_html=True)
            st.markdown("<br>".join([f"• {n}" for n in names_list]), unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)

            if link:
                if lang == "pt":
                    st.markdown(f"[Ver mais na WikiFavelas]({link})")
                else:
                    st.markdown(f"[See more on WikiFavelas]({link})")

            if desc:
                st.markdown("###### " + ("Descrição" if lang == "pt" else "Description"))
                st.write(desc)

            if notes:
                st.markdown("###### " + ("Observações" if lang == "pt" else "Notes"))
                st.write(notes)

st.markdown("</div>", unsafe_allow_html=True)

# -----------------------------
# STACKED BAR SECTION
# -----------------------------
st.markdown('<div class="section-card">', unsafe_allow_html=True)

if lang == "pt":
    st.subheader("Massacres ao longo do tempo")
    st.markdown(
        "Barras empilhadas mostram os tipos de vítimas em cada massacre. "
        "Clique em uma barra para ver apenas os nomes daquele massacre."
    )
else:
    st.subheader("Massacres over time")
    st.markdown(
        "Stacked bars show victim types in each massacre. "
        "Click a bar to see only the names from that massacre."
    )

# ---- Names list on top (for BAR selection) ----
bar_sel_id = st.session_state.get("selected_massacre_bar", None)

if bar_sel_id is None:
    # All names from the filtered dataset
    all_names = []
    for _, r in df_filtered.iterrows():
        all_names.extend(split_names(r["Names"]))
    all_names = sorted(set(all_names))
    title_text = "Todas as vítimas (dados filtrados)" if lang == "pt" else "All victims (current filter)"
    subtitle_text = "Clique em uma barra para filtrar por massacre." if lang == "pt" else "Click a bar to filter by massacre."
else:
    row_bar = df_filtered.loc[df_filtered["Massacre ID"] == bar_sel_id]
    if row_bar.empty:
        all_names = []
    else:
        row_bar = row_bar.iloc[0]
        all_names = split_names(row_bar["Names"])

    massacre_title = row_bar["Massacre Name"] if 'row_bar' in locals() else ""
    massacre_date = (
        row_bar["Date"].strftime("%d/%m/%Y") if 'row_bar' in locals() and pd.notna(row_bar["Date"]) else ""
    )
    if lang == "pt":
        title_text = f"Vítimas do massacre: {massacre_title} ({massacre_date})"
        subtitle_text = "Clique em outra barra para mudar o massacre ou limpe o filtro recarregando a página."
    else:
        title_text = f"Victims in massacre: {massacre_title} ({massacre_date})"
        subtitle_text = "Click another bar to change massacre or clear by reloading the page."

st.markdown(f"**{title_text}**")
st.markdown(f"<span class='small-label'>{subtitle_text}</span>", unsafe_allow_html=True)

st.markdown('<div class="names-box">', unsafe_allow_html=True)
if all_names:
    st.markdown("<br>".join([f"• {n}" for n in all_names]), unsafe_allow_html=True)
else:
    st.write("–")
st.markdown("</div>", unsafe_allow_html=True)

st.markdown("")  # spacing

# ---- Bar chart itself ----
if df_filtered.empty:
    st.warning("No data available for selected filters.")
    bar_selected = None
else:
    fig_bar = make_bar_figure(df_filtered, lang=lang)

    bar_selected_points = plotly_events(
        fig_bar,
        click_event=True,
        hover_event=False,
        override_height=550,
        key="bar",
    )

    bar_selected = None
    if bar_selected_points:
        cd = bar_selected_points[0].get("customdata", None)
        # customdata is [Massacre ID, Massacre Name, ...]
        if cd is not None:
            bar_selected = cd[0] if isinstance(cd, list) else cd
            st.session_state["selected_massacre_bar"] = bar_selected

    st.plotly_chart(fig_bar, use_container_width=True)

st.markdown("</div>", unsafe_allow_html=True)

# -----------------------------
# NECROPOLITICS TEXT PLACEHOLDER
# -----------------------------
st.markdown('<div class="section-card">', unsafe_allow_html=True)
if lang == "pt":
    st.subheader("À sombra do Cristo: necropolítica e memória")
    st.write(
        "_(Espaço reservado para o texto em que você irá discutir a necropolítica de Estado e a forma como os nomes aparecem e desaparecem.)_"
    )
else:
    st.subheader("Under the Christ’s Shadow: necropolitics and memory")
    st.write(
        "_(Space reserved for your text discussing state necropolitics and how names appear and disappear.)_"
    )
st.markdown("</div>", unsafe_allow_html=True)
