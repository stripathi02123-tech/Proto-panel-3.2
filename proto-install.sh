#!/usr/bin/env bash
# ============================================================================
#
#   ██████╗ ███████╗████████╗ ██████╗ ██████╗ ██████╗  ██████╗
#   ██╔════╝ ██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗
#   ██║  ███╗█████╗     ██║   ██║   ██║██████╔╝██║  ██║██║   ██║
#   ██║   ██║██╔══╝     ██║   ██║   ██║██╔══██╗██║  ██║██║   ██║
#   ╚██████╔╝███████╗   ██║   ╚██████╔╝██║  ██║██████╔╝╚██████╔╝
#    ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╚═════╝  ╚═════╝
#
#      P A N E L   ·   I N S T A L L A T I O N   W I Z A R D   v2.0.0
#
#   Full-screen OS-install-style wizard for Proto Panel.
#
#     · header      brand + version + live connection status
#     · stage list  9 real stages, checked off as they complete
#     · progress    blue→cyan→purple gradient line, REAL progress only
#                   (never shows 100% before final verification passes)
#     · live log    terminal-style timestamped stream of real command output
#     · success     version + service status + panel URL, from the live panel
#     · failure     the real error, the failed stage, diagnostics, safe retry
#
#   Usage:  bash proto-install.sh [options]
#           bash proto-install.sh --demo        (FX showcase, installs nothing)
#           bash proto-install.sh --dry-run     (full pipeline, no changes)
#
# ============================================================================

# --- make sure we are really running under bash -----------------------------
if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then exec bash "$0" "$@"; fi
fi

INSTALLER_NAME="Prism Wizard"
INSTALLER_VER="2.0.0"
PANEL_NAME="Proto Panel"
PANEL_TAGLINE="The next-generation game server panel"
DEFAULT_PORT=6767
DRY_SANDBOX=""

# --- option defaults ---------------------------------------------------------
OPT_DEMO=0; OPT_DRY=0; OPT_UPDATE=0; OPT_FAST=0; OPT_WIZARD=1
OPT_COLOR=""; OPT_MODE="auto"; OPT_OWNER=""; OPT_PASS=""; OPT_PORT=""
SRC_ARG=""   # optional local source: a Proto Panel .zip or a directory
LOG_FILE="proto-install.log"

# ============================================================================
#  SECTION 1 · TERMINAL & COLOR ENGINE
# ============================================================================

E=$'\033'
RESET="$E[0m"; BOLD="$E[1m"; DIM="$E[2m"; ITAL="$E[3m"
CLRL="$E[2K"; CR="\r"
CUR_STATE=1   # 1 = visible

COLOR_MODE=256   # 24 | 256 | 0
FX=0             # 1 = animations allowed
UNICODE=1
W=80

cur_hide() { if [ "$CUR_STATE" = 1 ]; then printf '%s' "$E[?25l"; CUR_STATE=0; fi; }
cur_show() { if [ "$CUR_STATE" = 0 ]; then printf '%s' "$E[?25h"; CUR_STATE=1; fi; }

setup_term() {
    # width -----------------------------------------------------------------
    W=$(tput cols 2>/dev/null || echo "${COLUMNS:-80}")
    case "$W" in ''|*[!0-9]*) W=80 ;; esac
    [ "$W" -lt 40 ] && W=40

    # unicode ---------------------------------------------------------------
    local enc
    enc=$(locale charmap 2>/dev/null || echo "")
    case "$enc" in
        UTF-8|utf8|UTF8) UNICODE=1 ;;
        *) case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
               *[Uu][Tt][Ff]*8*|*utf8*) UNICODE=1 ;;
               *) UNICODE=0 ;;
           esac ;;
    esac
    [ "$TERM" = "dumb" ] && UNICODE=0

    # color depth -----------------------------------------------------------
    if [ -n "$NO_COLOR" ] || [ "$OPT_COLOR" = "0" ]; then
        COLOR_MODE=0
    elif [ "$OPT_COLOR" = "24" ]; then
        COLOR_MODE=24
    elif [ "$OPT_COLOR" = "256" ]; then
        COLOR_MODE=256
    elif case "$COLORTERM" in *truecolor*|*24bit*) true ;; *) false ;; esac \
         || case "$TERM" in xterm-kitty|alacritty|wezterm|contour|ghostty|foot) true ;; *) false ;; esac; then
        COLOR_MODE=24
    elif [ -t 1 ] && case "$TERM" in dumb|linux) false ;; *) true ;; esac; then
        COLOR_MODE=256
    else
        COLOR_MODE=0
    fi

    # animation -------------------------------------------------------------
    if [ -t 1 ] && [ "$COLOR_MODE" != "0" ] && [ "$TERM" != "dumb" ] \
       && [ -z "${CI:-}" ] && [ -z "${GITHUB_ACTIONS:-}" ] && [ -z "${GITLAB_CI:-}" ]; then
        FX=1
    fi

    # bar width scales with terminal
    W_BAR=$(( W / 3 ))
    [ $W_BAR -gt 34 ] && W_BAR=34
    [ $W_BAR -lt 16 ] && W_BAR=16

    # symbol sets -----------------------------------------------------------
    if [ "$UNICODE" = "1" ]; then
        SPIN=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
        ICO_OK="✔"; ICO_FAIL="✖"; ICO_WARN="⚠"; ICO_INFO="ℹ"
        ICO_ARROW="➜"; ICO_DOT="●"; ICO_SPARK="✦"
        BLK_F="█"; BLK_E="░"; LN_D="─"; LN_B="━"
        B_TL="╭"; B_TR="╮"; B_BL="╰"; B_BR="╯"; B_V="│"; B_H="─"; B_ML="├"; B_MR="┤"
        CONF_SYMS=( "✦" "✧" "●" "◆" "▸" "★" "☆" "⬥" )
        PULSE_F=( "· ● ·" "·· ● ··" "··· ● ···" "···· ● ····" )
        PEND_ICO="○"; SKIP_ICO="◌"; BRAND_ICO="◆"; ELLIPSIS="…"
    else
        SPIN=( "|" "/" "-" "\\" )
        ICO_OK="[OK]"; ICO_FAIL="[!!]"; ICO_WARN="[!]"; ICO_INFO="[i]"
        ICO_ARROW="->"; ICO_DOT="*"; ICO_SPARK="*"
        BLK_F="#"; BLK_E="."; LN_D="-"; LN_B="="
        B_TL="+"; B_TR="+"; B_BL="+"; B_BR="+"; B_V="|"; B_H="-"; B_ML="+"; B_MR="+"
        CONF_SYMS=( "*" "+" "o" "x" "@" "." )
        PULSE_F=( "  *  " " .*. " "..*.." ". * ." "  *  " )
        PEND_ICO="."; SKIP_ICO="-"; BRAND_ICO="*"; ELLIPSIS="..."
    fi

    # mono mode: strip every control sequence so piped output stays clean
    if [ "$COLOR_MODE" = "0" ]; then
        RESET=""; BOLD=""; DIM=""; ITAL=""; CLRL=""; CR=""
    fi
}

# cls — clear screen only on a real animated terminal
cls() {
    [ "$FX" = "1" ] && printf '\033[H\033[2J'
    return 0
}

# frames_for N -> N normally, N/2 when --fast
frames_for() {
    local n=$1
    if [ "$OPT_FAST" = "1" ]; then n=$(( n / 2 + 1 )); fi
    echo "$n"
}

# sleep helper honouring --fast
fsleep() {
    local d=$1
    if [ "$OPT_FAST" = "1" ]; then d=$(( d * 45 / 100 )); fi
    command sleep "$d" 2>/dev/null || sleep "$d"
}

# fg R G B -> sets FG_OUT (escape prefix, "" when mono)
fg() {
    if [ "$COLOR_MODE" = "24" ]; then
        FG_OUT="$E[38;2;$1;$2;$3m"
    elif [ "$COLOR_MODE" = "256" ]; then
        FG_OUT="$E[38;5;$(( 16 + ( $1 * 6 / 256 ) * 36 + ( $2 * 6 / 256 ) * 6 + ( $3 * 6 / 256 ) ))m"
    else
        FG_OUT=""
    fi
}

# dim/white/etc shortcuts (colored variants)
fg_dim()   { fg 108 122 145; printf '%s' "$DIM$FG_OUT"; }
fg_white() { fg 235 240 255; printf '%s' "$BOLD$FG_OUT"; }
fg_ok()    { fg  80 250 123; printf '%s' "$BOLD$FG_OUT"; }
fg_fail()  { fg 255  85  95; printf '%s' "$BOLD$FG_OUT"; }
fg_warn()  { fg 255 200  70; printf '%s' "$BOLD$FG_OUT"; }
fg_info()  { fg 120 190 255; printf '%s' "$BOLD$FG_OUT"; }
fg_gold()  { fg 255 200  90; printf '%s' "$BOLD$FG_OUT"; }

# ============================================================================
#  SECTION 2 · TEXT EFFECTS (gradients · rainbow · typewriter · sweeps)
# ============================================================================

# grad_print "text" R1 G1 B1 R2 G2 B2   (per-character linear gradient)
grad_print() {
    local text="$1" r1=$2 g1=$3 b1=$4 r2=$5 g2=$6 b2=$7
    local n=${#text}
    local d=$(( n > 1 ? n - 1 : 1 ))
    local i
    if [ "$COLOR_MODE" = "0" ]; then printf '%s' "$text"; return; fi
    for (( i = 0; i < n; i++ )); do
        fg $(( ( r1 * ( d - i ) + r2 * i ) / d )) \
           $(( ( g1 * ( d - i ) + g2 * i ) / d )) \
           $(( ( b1 * ( d - i ) + b2 * i ) / d ))
        printf '%s%s' "$FG_OUT" "${text:i:1}"
    done
    printf '%s' "$RESET"
}

# rainbow anchors ×255: red orange yellow green cyan blue violet pink -> red
RB_P=(255 0 0  255 140 0  255 230 0  60 255 60  0 220 255 \
       80 120 255  160 60 255  255 0 140  255 0 0)

# rainbow_print "text" PHASE SPEED   (phase in 1/1000ths, cycles across text)
rainbow_print() {
    local text="$1" ph=$2 sp=$3
    local n=${#text} i t seg fr1 ar ag ab br bg2 bb
    if [ "$COLOR_MODE" = "0" ]; then printf '%s' "$text"; return; fi
    for (( i = 0; i < n; i++ )); do
        t=$(( ( ph + i * sp ) % 8000 ))
        seg=$(( t / 1000 )); fr1=$(( t % 1000 ))
        ar=${RB_P[seg*3]};   ag=${RB_P[seg*3+1]}; ab=${RB_P[seg*3+2]}
        br=${RB_P[seg*3+3]}; bg2=${RB_P[seg*3+4]}; bb=${RB_P[seg*3+5]}
        fg $(( ( ar * ( 1000 - fr1 ) + br * fr1 ) / 1000 )) \
           $(( ( ag * ( 1000 - fr1 ) + bg2 * fr1 ) / 1000 )) \
           $(( ( ab * ( 1000 - fr1 ) + bb * fr1 ) / 1000 ))
        printf '%s%s' "$FG_OUT" "${text:i:1}"
    done
    printf '%s' "$RESET"
}

# typew "text" R1 G1 B1 R2 G2 B2 [slow]
#   slow=1 -> types at a more relaxed pace
typew() {
    local text="$1" r1=$2 g1=$3 b1=$4 r2=$5 g2=$6 b2=$7 slow=${8:-0}
    local n=${#text} i sd=0.012
    [ "$slow" = "1" ] || [ "$slow" = "18" ] && sd=0.020
    [ "$slow" = "12" ] && sd=0.014
    if [ "$OPT_FAST" = "1" ]; then sd=0.005; fi
    if [ "$FX" != "1" ]; then grad_print "$text" "$r1" "$g1" "$b1" "$r2" "$g2" "$b2"; printf '\n'; return; fi
    local caret="_"
    [ "$UNICODE" = "1" ] && caret="▌"
    for (( i = 0; i < n; i++ )); do
        fg $(( ( r1 * ( n - 1 - i ) + r2 * i ) / ( n > 1 ? n - 1 : 1 ) )) \
           $(( ( g1 * ( n - 1 - i ) + g2 * i ) / ( n > 1 ? n - 1 : 1 ) )) \
           $(( ( b1 * ( n - 1 - i ) + b2 * i ) / ( n > 1 ? n - 1 : 1 ) ))
        printf '%s%s' "$BOLD$FG_OUT" "${text:i:1}"
        sleep "$sd" 2>/dev/null || sleep 1
    done
    # blinking caret flourish
    local b
    for b in 1 2 3; do
        printf '%s%s' "$E[1;97m" "$caret"; sleep 0.09
        printf '\b \b'; sleep 0.06
    done
    printf '%s\n' "$RESET"
}

# center_pad "text" -> prints left padding spaces for centering
center_pad() {
    local n=${#1}
    local pad=$(( ( W - n ) / 2 ))
    [ "$pad" -lt 0 ] && pad=0
    printf '%*s' "$pad" ""
}

# center_print "text" -> centered line
center_print() {
    center_pad "$1"
    printf '%s\n' "$1"
}

# scan_sweep [passes] — a bright gradient segment racing across a dim rule
scan_sweep() {
    local passes=${1:-1}
    local w=$(( W < 90 ? W : 90 ))
    local seg=7 p x j
    if [ "$FX" != "1" ]; then
        printf '%s' "$DIM"; fg 60 75 100
        for (( j = 0; j < w; j++ )); do printf '%s' "$LN_D"; done
        printf '%s\n' "$RESET"
        return
    fi
    for (( p = 0; p < passes; p++ )); do
        for (( x = 0; x <= w - seg; x++ )); do
            printf '\r'
            printf '%s' "$DIM"; fg 45 60 85
            for (( j = 0; j < x; j++ )); do printf '%s' "$LN_D"; done
            printf '%s' "$RESET"
            for (( j = 0; j < seg; j++ )); do
                fg $(( 110 + j * 20 )) $(( 190 + j * 9 )) 255
                printf '%s' "$LN_B"
            done
            printf '%s' "$RESET"
            printf '%s' "$DIM"; fg 45 60 85
            for (( j = x + seg; j < w; j++ )); do printf '%s' "$LN_D"; done
            printf '%s' "$RESET"
            sleep 0.007
        done
    done
    printf '\n'
}

# ============================================================================
#  SECTION 3 · LOGO ENGINE (block letters, animated reveal + rainbow wave)
# ============================================================================

GLYPH_P=( "██████╗ " "██╔══██╗" "██████╔╝" "██╔══██╗" "██║  ██║" "╚═╝  ╚═╝" )
GLYPH_R=( "██████╗ " "██╔══██╗" "██████╔╝" "██╔══██╗" "██║ ██╔╝" "╚═╝ ╚══╝" )
GLYPH_O=( " ██████╗ " "██╔═══██╗" "██║   ██║" "██║   ██║" "╚██████╔╝" " ╚═════╝ " )
GLYPH_T=( "████████╗" "╚══██╔══╝" "   ██║   " "   ██║   " "   ██║   " "   ╚═╝   " )
GLYPH_A=( " █████╗ " "██╔══██╗" "███████║" "██╔══██║" "██║  ██║" "╚═╝  ╚═╝" )
GLYPH_N=( "███╗   ██╗" "████╗  ██╗" "██╔██╗ ██║" "██║╚██╗██║" "██║ ╚████║" "╚═╝  ╚═══╝" )
GLYPH_E=( "███████╗" "██╔════╝" "█████╗  " "██╔══╝  " "███████╗" "╚══════╝" )
GLYPH_L=( "██╗     " "██║     " "██║     " "██║     " "███████╗" "╚══════╝" )

LOGO_ROWS=()
LOGO_W=0

# build_logo "PROTO" "PANEL" -> stacked block-letter rows in LOGO_ROWS[]
build_logo() {
    local word r i
    LOGO_ROWS=()
    local r0="" r1="" r2="" r3="" r4="" r5=""
    for word in "$@"; do
        for (( i = 0; i < ${#word}; i++ )); do
            local g
            case "${word:i:1}" in
                P) g=( "${GLYPH_P[@]}" ) ;;
                R) g=( "${GLYPH_R[@]}" ) ;;
                O) g=( "${GLYPH_O[@]}" ) ;;
                T) g=( "${GLYPH_T[@]}" ) ;;
                A) g=( "${GLYPH_A[@]}" ) ;;
                N) g=( "${GLYPH_N[@]}" ) ;;
                E) g=( "${GLYPH_E[@]}" ) ;;
                L) g=( "${GLYPH_L[@]}" ) ;;
                *) g=( "" "" "" "" "" "" ) ;;
            esac
            r0="$r0${g[0]} "; r1="$r1${g[1]} "; r2="$r2${g[2]} "
            r3="$r3${g[3]} "; r4="$r4${g[4]} "; r5="$r5${g[5]} "
        done
        # trim trailing space of each line
        r0="${r0% }"; r1="${r1% }"; r2="${r2% }"; r3="${r3% }"; r4="${r4% }"; r5="${r5% }"
        if [ ${#LOGO_ROWS[@]} -gt 0 ]; then LOGO_ROWS=("${LOGO_ROWS[@]}" ""); fi
        LOGO_ROWS=("${LOGO_ROWS[@]}" "$r0" "$r1" "$r2" "$r3" "$r4" "$r5")
    done
    LOGO_W=0
    for r in "${LOGO_ROWS[@]}"; do [ ${#r} -gt $LOGO_W ] && LOGO_W=${#r}; done
}

# compact fallback when the terminal is narrow or ASCII-only
compact_logo() {
    center_pad "PROTO PANEL"; rainbow_print "PROTO PANEL" 0 90; printf '\n'
}

# show_logo — reveal sweep + looping rainbow wave
show_logo() {
    local total=${#LOGO_ROWS[@]}
    local r i f k mask ph n

    if [ "$UNICODE" != "1" ] || [ "$W" -lt $(( LOGO_W + 4 )) ]; then
        compact_logo
        return
    fi

    if [ "$FX" != "1" ]; then
        for r in "${LOGO_ROWS[@]}"; do
            center_pad "$r"
            if [ "$COLOR_MODE" != "0" ]; then rainbow_print "$r" 0 60; else printf '%s' "$r"; fi
            printf '\n'
        done
        return
    fi

    cur_hide

    # ---- phase A: diagonal reveal with a bright wavefront -------------------
    local frames
    frames=$(frames_for $(( LOGO_W / 2 + 6 )))
    for (( f = 0; f < frames; f++ )); do
        [ $f -gt 0 ] && printf '\033[%dA' $(( total - 1 ))
        for (( i = 0; i < total; i++ )); do
            printf '\r%s' "$CLRL"
            r="${LOGO_ROWS[i]}"
            n=${#r}
            mask=$(( f * 2 - i ))
            for (( k = 0; k < n; k++ )); do
                if [ $k -lt $mask ]; then
                    rainbow_print "${r:k:1}" $(( k * 90 + i * 40 )) 0
                elif [ $k -eq $mask ]; then
                    fg 255 255 255; printf '%s%s' "$BOLD$FG_OUT" "${r:k:1}"
                else
                    printf ' '
                fi
            done
            printf '%s' "$RESET"
            [ $(( i + 1 )) -lt $total ] && printf '\n'
        done
        sleep 0.028
    done

    # ---- phase B: rainbow wave ----------------------------------------------
    frames=$(frames_for 22)
    for (( f = 0; f < frames; f++ )); do
        printf '\033[%dA' $(( total - 1 ))
        for (( i = 0; i < total; i++ )); do
            printf '\r%s' "$CLRL"
            r="${LOGO_ROWS[i]}"
            n=${#r}
            ph=$(( f * 320 + i * 430 ))
            for (( k = 0; k < n; k++ )); do
                rainbow_print "${r:k:1}" $(( ph + k * 70 )) 0
            done
            printf '%s' "$RESET"
            [ $(( i + 1 )) -lt $total ] && printf '\n'
        done
        sleep 0.055
    done
    printf '\n'
    cur_show
}

# ============================================================================
#  SECTION 4 · BARS · SPINNERS · MATRIX · CONFETTI · BOXES  (demo / summary FX)
# ============================================================================

W_BAR=30

# draw_bar PCT LABEL FRAME  (single line, gradient fill + spinner)
draw_bar() {
    local pct=$1 label="$2" fr=$3
    local fill=$(( pct * W_BAR / 100 )) j
    local maxl=$(( W - W_BAR - 12 ))
    local lb="$label"
    [ $maxl -lt 4 ] && maxl=4
    [ ${#lb} -gt $maxl ] && lb="${lb:0:$maxl}"
    printf '\r%s' "$CLRL"
    printf '%s ' "${SPIN[$(( fr % ${#SPIN[@]} ))]}"
    for (( j = 0; j < W_BAR; j++ )); do
        if [ $j -lt $fill ]; then
            fg $(( 56 + ( 200 - 56 ) * j / W_BAR )) \
               $(( 189 + ( 60 - 189 ) * j / W_BAR )) \
               $(( 248 + ( 255 - 248 ) * j / W_BAR ))
            printf '%s%s' "$FG_OUT" "$BLK_F"
        else
            printf '%s%s' "$DIM" "$BLK_E"
        fi
    done
    printf '%s' "$RESET"
    fg 140 155 180; printf ' %3d%%' "$pct"; printf '%s' "$RESET"
    printf '%s ' "$DIM"
    printf '%s%s' "$RESET" "$lb"
}

# clear_region ROWS — cursor sits on the region's bottom line, ends on its top
clear_region() {
    local r=$1 i
    printf '\r%s' "$CLRL"
    for (( i = 1; i < r; i++ )); do
        printf '\033[1A\r%s' "$CLRL"
    done
}

fx_spin_loop() {  # fx_spin_loop PID LABEL
    local pid=$1 label="$2" fr=0 el t0
    t0=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        el=$(( $(date +%s) - t0 ))
        printf '\r%s' "$CLRL"
        printf '%s ' "${SPIN[$(( fr % ${#SPIN[@]} ))]}"
        grad_print "$label" 110 160 255 190 110 255
        printf '%s' "$DIM"; fg 120 130 150
        printf '  %ds' "$el"; printf '%s' "$RESET"
        fr=$(( fr + 1 ))
        sleep 0.09
    done
    printf '\r%s' "$CLRL"
}

fx_pulse_loop() {  # fx_pulse_loop PID LABEL
    local pid=$1 label="$2" fr=0 el t0
    t0=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        el=$(( $(date +%s) - t0 ))
        printf '\r%s' "$CLRL"
        printf '  '
        if [ $(( fr % 2 )) -eq 0 ]; then fg 110 200 255; else fg 80 250 123; fi
        printf '%s' "$BOLD$FG_OUT"
        printf '%s' "${PULSE_F[$(( fr % ${#PULSE_F[@]} ))]}"
        printf '%s' "$RESET"
        printf ' '
        grad_print "$label" 110 200 255 80 250 123
        printf '%s' "$DIM"; fg 120 130 150
        printf '  %ds' "$el"; printf '%s' "$RESET"
        fr=$(( fr + 1 ))
        sleep 0.16
    done
    printf '\r%s' "$CLRL"
}

fx_bar_loop() {  # fx_bar_loop PID LABEL — eases toward 92% while running
    local pid=$1 label="$2" pct=0 fr=0
    while kill -0 "$pid" 2>/dev/null; do
        pct=$(( pct + ( 92 - pct ) * 7 / 100 ))
        [ $pct -ge 92 ] && pct=91
        draw_bar "$pct" "$label" "$fr"
        fr=$(( fr + 1 ))
        sleep 0.12
    done
    printf '\r%s' "$CLRL"
}

MATRIX_GLYPHS=( "0" "1" "2" "3" "4" "5" "6" "7" "8" "9" "A" "B" "C" "D" "E" "F" "$" "#" "%" "&" "@" )

fx_matrix_loop() {  # fx_matrix_loop PID LABEL — matrix rain + status line
    local pid=$1 label="$2"
    local rows=6 r x end fr=0 el t0
    t0=$(date +%s)
    end=$(( W > 74 ? 74 : W - 2 ))
    # reserve the region once
    for (( r = 0; r < rows; r++ )); do printf '\n'; done
    printf '\n'
    printf '\033[%dA' $(( rows + 1 ))
    while kill -0 "$pid" 2>/dev/null; do
        el=$(( $(date +%s) - t0 ))
        for (( r = 0; r < rows; r++ )); do
            printf '\r%s' "$CLRL"
            for (( x = 0; x < end; x++ )); do
                if [ $(( RANDOM % 100 )) -lt 40 ]; then
                    fg $(( 50 + ( 190 - 50 ) * r / rows )) 255 $(( 60 + ( 110 - 60 ) * r / rows ))
                    printf '%s%s' "$FG_OUT" "${MATRIX_GLYPHS[$(( RANDOM % ${#MATRIX_GLYPHS[@]} ))]}"
                else
                    printf ' '
                fi
            done
            printf '\n'
        done
        # status line
        printf '\r%s' "$CLRL"
        printf '%s ' "${SPIN[$(( fr % ${#SPIN[@]} ))]}"
        grad_print "$label" 80 255 140 110 200 255
        printf '%s' "$DIM"; fg 120 130 150
        printf '  %ds' "$el"; printf '%s' "$RESET"
        printf '\n'
        printf '\033[%dA' $(( rows + 1 ))
        fr=$(( fr + 1 ))
        sleep 0.09
    done
    # cursor sits on the region's top line -> walk down to bottom, then clear
    printf '\033[%dB' $(( rows ))
    clear_region $(( rows + 1 ))
}

# confetti — particle burst below the summary box
confetti() {
    [ "$FX" = "1" ] || return 0
    local rows=10 frames np=46 i f r k row cix
    frames=$(frames_for 22)
    cur_hide
    local -a PC PS PSPD PPH PCR PCG PCB
    CONF_PAL=(255 90 90  255 205 70  100 255 150  100 170 255  225 95 255  255 255 255)
    for (( i = 0; i < np; i++ )); do
        PC[$i]=$(( RANDOM % ( W - 6 ) + 3 ))
        PS[$i]=${CONF_SYMS[$(( RANDOM % ${#CONF_SYMS[@]} ))]}
        PSPD[$i]=$(( 1 + RANDOM % 2 ))
        PPH[$i]=$(( RANDOM % 6 ))
        cix=$(( RANDOM % 6 * 3 ))
        PCR[$i]=${CONF_PAL[cix]}; PCG[$i]=${CONF_PAL[cix+1]}; PCB[$i]=${CONF_PAL[cix+2]}
    done
    # reserve region
    for (( r = 0; r < rows; r++ )); do printf '\n'; done
    printf '\033[%dA' "$rows"
    for (( f = 0; f < frames; f++ )); do
        for (( r = 0; r < rows; r++ )); do
            printf '\r%s' "$CLRL"
            for (( k = 0; k < np; k++ )); do
                row=$(( PPH[k] + PSPD[k] * f ))
                if [ $row -eq $r ]; then
                    fg "${PCR[k]}" "${PCG[k]}" "${PCB[k]}"
                    printf '\033[%dG%s%s%s' "$(( PC[k] ))" "$FG_OUT" "${PS[k]}" "$RESET"
                fi
            done
            [ $(( r + 1 )) -lt $rows ] && printf '\n'
        done
        printf '\033[%dA' $(( rows - 1 ))
        sleep 0.055
    done
    # cursor is on the region's top line -> walk down to bottom, then clear
    printf '\033[%dB' $(( rows - 1 ))
    clear_region "$rows"
    cur_show
}

# glow_box TITLE CONTENT... — gradient-bordered panel drawn with a sweep
# usage: glow_box TITLE "line1" "line2" ...
glow_box() {
    local title="$1"; shift
    local lines=("$@")
    local inner=46 i w=$W
    [ $(( w - 8 )) -lt $inner ] && inner=$(( w - 8 ))
    [ $inner -lt 30 ] && inner=30
    local longest=$inner
    for l in "${lines[@]}"; do
        local v=${#l}
        [ $v -gt $longest ] && longest=$v
    done
    inner=$(( longest + 1 ))
    local pad=$(( ( inner - ${#title} ) / 2 )); [ $pad -lt 1 ] && pad=1
    local t2=$(( inner - pad - ${#title} )); [ $t2 -lt 0 ] && t2=0

    # top border with gradient sweep + corners
    if [ "$FX" = "1" ]; then
        printf ' '
        grad_print "$B_TL" 56 189 248 56 189 248
        for (( i = 0; i < inner; i++ )); do
            fg $(( 56 + ( 160 - 56 ) * i / ( inner + 1 ) )) \
               $(( 189 + ( 90 - 189 ) * i / ( inner + 1 ) )) \
               $(( 248 + ( 255 - 248 ) * i / ( inner + 1 ) ))
            printf '%s%s' "$FG_OUT" "$B_H"
            sleep 0.004
        done
        grad_print "$B_TR" 160 90 255 160 90 255
        printf '\n'
    else
        printf ' '
        grad_print "${B_TL}$(for ((i=0;i<inner;i++)); do printf '%s' "$B_H"; done)${B_TR}" 56 189 248 160 90 255
        printf '\n'
    fi

    # title row
    printf ' '
    grad_print "$B_V" 90 140 230 160 90 255
    printf '%*s' "$pad" ""
    grad_print "$title" 255 220 130 255 150 200
    printf '%*s' "$t2" ""
    grad_print "$B_V" 90 140 230 160 90 255
    printf '\n'

    # separator
    printf ' '
    grad_print "$B_ML" 90 140 230 160 90 255
    for (( i = 0; i < inner; i++ )); do printf '%s' "$LN_D"; done
    grad_print "$B_MR" 90 140 230 160 90 255
    printf '\n'

    # content rows
    for l in "${lines[@]}"; do
        printf ' '
        grad_print "$B_V" 90 140 230 160 90 255
        printf ' %s' "$l"
        local vp=$(( inner - ${#l} - 1 ))
        [ $vp -lt 0 ] && vp=0
        printf '%*s' "$vp" ""
        grad_print "$B_V" 90 140 230 160 90 255
        printf '\n'
    done

    # bottom border (gradient + corners)
    printf ' '
    grad_print "${B_BL}$(for ((i=0;i<inner;i++)); do printf '%s' "$B_H"; done)${B_BR}" 160 90 255 56 189 248
    printf '\n'
}

# ============================================================================
#  SECTION 5 · LOGGING · SAFE RUN · ERROR HANDLING
# ============================================================================

LOG="proto-install.log"
MASK_NEXT=0
BG_PID=""
DIE_DONE=0
QUIET_EXIT=0
START_TS=0

log() { printf '%s\n' "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

hr_log() { printf '%s\n' "--------------------------------------------------------------" >> "$LOG"; }

# run_fx LABEL STYLE(sp|bar|matrix|pulse) -- cmd...
#   LEGACY runner kept for --demo mode. The real pipeline uses wiz_run().
run_fx() {
    local label="$1" style="$2"; shift 2
    [ "${1:-}" = "--" ] && shift
    if [ "$MASK_NEXT" = "1" ]; then
        log "RUN: (credentials hidden)"
        MASK_NEXT=0
    else
        log "RUN: $*"
    fi

    if [ "$OPT_DRY" = "1" ]; then
        printf '  '
        fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
        printf ' %s ' "$label"
        printf '%s' "$DIM"; printf '[dry-run · skipped]\n'; printf '%s' "$RESET"
        return 0
    fi

    local t0 el rc=0
    t0=$(date +%s)
    "$@" >> "$LOG" 2>&1 &
    BG_PID=$!

    if [ "$FX" = "1" ]; then
        cur_hide
        case "$style" in
            bar)    fx_bar_loop    "$BG_PID" "$label" ;;
            matrix) fx_matrix_loop "$BG_PID" "$label" ;;
            pulse)  fx_pulse_loop  "$BG_PID" "$label" ;;
            *)      fx_spin_loop   "$BG_PID" "$label" ;;
        esac
        cur_show
    else
        printf '  ... %s\n' "$label"
    fi

    wait "$BG_PID" || rc=$?
    BG_PID=""
    el=$(( $(date +%s) - t0 ))

    if [ "$rc" -eq 0 ]; then
        printf '  '
        fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s ' "$label"
        printf '%s' "$DIM"; printf '(%ds)\n' "$el"; printf '%s' "$RESET"
    else
        printf '  '
        fg_fail; printf '%s' "$ICO_FAIL"; printf '%s' "$RESET"
        printf ' %s ' "$label"
        fg_fail; printf '[FAILED]\n'; printf '%s' "$RESET"
        log "FAILED ($rc): $label"
    fi
    return "$rc"
}

# like run_fx but shows the command output live (legacy; PIPESTATUS-safe)
run_fx_live() {
    local label="$1"; shift
    log "RUN(live): $*"
    if [ "$OPT_DRY" = "1" ]; then
        printf '  '; fg_info; printf '%s [dry-run · skipped]\n' "$ICO_INFO"; printf '%s' "$RESET"
        return 0
    fi
    printf '  '; fg_warn; printf '%s' "$ICO_WARN"; printf '%s' "$RESET"
    printf ' %s (password may be asked)\n' "$label"
    local rc=0
    "$@" 2>&1 | tee -a "$LOG"
    rc=${PIPESTATUS[0]}
    if [ "$rc" -eq 0 ]; then
        printf '  '; fg_ok; printf '%s %s\n' "$ICO_OK" "$label"; printf '%s' "$RESET"
        return 0
    fi
    printf '  '; fg_fail; printf '%s %s [FAILED]\n' "$ICO_FAIL" "$label"; printf '%s' "$RESET"
    return 1
}

# die "message" "stage-label" — failure screen with the REAL error, the failed
# stage, live diagnostics and safe-retry instructions.
die() {
    local msg="$1" phase="${2:-install}"
    DIE_DONE=1
    # inside the wizard: mark the failing stage so the user sees WHERE it broke
    if [ "$WIZ_FULL" = "1" ]; then
        if [ "${WIZ_STAGE_IDX:--1}" -ge 0 ]; then
            WIZ_STATE[$WIZ_STAGE_IDX]="fail"
            wiz_draw_stages 2>/dev/null
        fi
        WIZ_STAT_LABEL="failed"
        wiz_draw_status 2>/dev/null
        sleep 0.7
    fi
    wiz_leave 2>/dev/null
    cur_show
    printf '\n'
    # blinking failure title (animated terminals only)
    if [ "$FX" = "1" ]; then
        local b
        for b in 1 2 3; do
            printf '\r%s' "$CLRL"
            printf '  '
            fg_fail; printf '%s %s' "$ICO_FAIL" "INSTALLATION FAILED"; printf '%s\n' "$RESET"
            sleep 0.18
            printf '\033[1A\r%s' "$CLRL"
            printf '  '
            fg 255 140 140; printf '%s %s' "$ICO_FAIL" "INSTALLATION FAILED"; printf '%s\n' "$RESET"
            sleep 0.18
        done
        printf '\033[1A'
    else
        printf '  '
        printf '%s INSTALLATION FAILED\n' "$ICO_FAIL"
    fi
    printf '\n  %s\n' "$msg"
    # which stage failed (when the wizard was running)
    if [ "${WIZ_STAGE_IDX:--1}" -ge 0 ]; then
        printf '  %s' "$DIM"
        printf 'failed at: stage %d/9 · %s\n' "$(( WIZ_STAGE_IDX + 1 ))" "${WIZ_STAGES[$WIZ_STAGE_IDX]}"
        printf '%s' "$RESET"
    fi
    printf '  %s' "$DIM"
    printf 'phase: %s · full log: %s\n' "$phase" "$LOG"
    printf '%s' "$RESET"
    # live diagnostics — real values, read at failure time
    printf '\n  %s\n' "${DIM}--- diagnostics ---${RESET}"
    printf '  %-9s %s\n' "disk:"   "$(df -Ph / 2>/dev/null | awk 'NR==2{print $4 " free of " $2}')"
    printf '  %-9s %s\n' "node:"   "$(have node && node -v 2>/dev/null || echo 'not installed')"
    printf '  %-9s %s\n' "docker:" "$(have docker && echo 'installed' || echo 'not installed')"
    printf '  %-9s %s\n' "mode:"   "${INSTALL_MODE:-undecided}"
    if [ -s "$LOG" ]; then
        printf '\n  %s\n' "${DIM}--- last 15 log lines ---${RESET}"
        tail -n 15 "$LOG" 2>/dev/null | sed 's/^/  /'
    fi
    printf '\n  %s\n' "${DIM}--- safe retry ---${RESET}"
    printf '   %s stages are idempotent — fix the issue above and simply re-run\n' "$ICO_ARROW"
    printf '   %s bash proto-install.sh            (install again, nothing breaks)\n' "$ICO_ARROW"
    printf '   %s bash proto-install.sh --update   (existing installation)\n' "$ICO_ARROW"
    printf '   %s full command output: less %s\n' "$ICO_ARROW" "$LOG"
    printf '\n'
    exit 1
}

cleanup() {
    local rc=$?
    [ -n "$BG_PID" ] && kill "$BG_PID" 2>/dev/null
    if [ -n "$WIZ_RUN_TMP" ] && [ -f "$WIZ_RUN_TMP" ]; then
        rm -f "$WIZ_RUN_TMP" 2>/dev/null
    fi
    if [ -n "${DRY_SANDBOX:-}" ] && [ -d "$DRY_SANDBOX" ]; then
        rm -rf "$DRY_SANDBOX" 2>/dev/null
    fi
    wiz_leave 2>/dev/null
    cur_show
    printf '%s' "$RESET"
    if [ "$DIE_DONE" != "1" ] && [ "$rc" -ne 0 ] && [ "${QUIET_EXIT:-0}" != "1" ]; then
        printf '\n  '
        fg_warn; printf '%s' "$ICO_WARN"; printf '%s' "$RESET"
        printf ' installer exited (code %s) — terminal restored, log: %s\n' "$rc" "$LOG"
    fi
    trap - EXIT
    exit "$rc"
}

on_int() {
    DIE_DONE=1
    wiz_leave 2>/dev/null
    cur_show
    printf '\n\n  '
    fg_warn; printf '%s' "$ICO_WARN"; printf '%s' "$RESET"
    printf ' interrupted by user — terminal restored. nothing was broken.\n'
    exit 130
}

# ============================================================================
#  SECTION 6 · SYSTEM HELPERS
# ============================================================================

have() { command -v "$1" >/dev/null 2>&1; }

run_root() {
    if [ "$(id -u)" = "0" ]; then "$@"
    elif have sudo; then sudo "$@"
    else "$@"
    fi
}

# sudo usable without an interactive password prompt?
sudo_nonint() {
    [ "$(id -u)" = "0" ] && return 0
    have sudo || return 1
    sudo -n true 2>/dev/null
}

get_docker_cmd() {
    if docker info >/dev/null 2>&1; then echo "docker"
    elif have sudo && sudo -n docker info >/dev/null 2>&1; then echo "sudo docker"
    else echo "docker"
    fi
}

get_compose_cmd() {
    local d
    d=$(get_docker_cmd)
    if $d compose version >/dev/null 2>&1; then echo "$d compose"
    elif have docker-compose; then echo "docker-compose"
    elif have sudo && sudo -n docker-compose version >/dev/null 2>&1; then echo "sudo docker-compose"
    else echo "$d compose"
    fi
}

pkg_mgr() {
    if   have apt-get;  then echo "apt"
    elif have dnf;      then echo "dnf"
    elif have yum;      then echo "yum"
    elif have pacman;   then echo "pacman"
    elif have zypper;   then echo "zypper"
    elif have apk;      then echo "apk"
    else echo "none"
    fi
}

get_sys_ip() {
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$ip" ] && ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(curl -s --connect-timeout 1 --max-time 2 ifconfig.me 2>/dev/null)
    fi
    [ -z "$ip" ] && ip="127.0.0.1"
    printf '%s' "$ip"
}

gen_pass() {
    local p
    p=$(tr -dc 'A-HJ-NP-Za-km-z2-9' < /dev/urandom 2>/dev/null | head -c 16)
    if [ ${#p} -lt 12 ]; then
        p="Proto$(head -c 240 /dev/urandom 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n' | tr 'a-f' 'A-F' | head -c 12)"
    fi
    [ ${#p} -lt 8 ] && p="Proto$RANDOM$RANDOM$RANDOM"
    printf '%s' "$p"
}

# ============================================================================
#  SECTION 6.5 · INSTALLATION WIZARD — full-screen UI engine
# ============================================================================
#
#  Layout (terminal H×W, requires H≥27 and W≥64 — otherwise a plain flowing
#  fallback is used so CI pipes and tiny consoles stay readable):
#
#    1-3   header  — brand · version · live connection chips
#    5-13  stages  — 9 stage rows with real state icons
#    15    bar     — blue→cyan→purple gradient, glowing tip, REAL percent
#    16    status  — spinner · stage · current label · elapsed
#    18    divider — "live log"
#    19-H  log     — timestamped stream of real command output (auto-scroll)
#    H     footer  — percent · stage · elapsed · log file
#
#  PROGRESS RULE: the bar only advances on events that really happened
#  (checks passed, commands exited 0, polls answered). It reaches 100 %
#  exclusively after stage 8 (final verification) passed the live health
#  AND login test. No fake progress, ever.

WIZ_STAGES=(
    "System requirements" "Dependencies" "Environment" "Data store"
    "Backend" "Frontend build" "Services" "Final verification" "Complete"
)
WIZ_WEIGHTS=( 6 14 12 8 20 22 10 8 0 )
WIZ_CUM=( 0 6 20 32 40 60 82 92 100 )
ST_SYSREQ=0; ST_DEPS=1; ST_ENV=2; ST_DATA=3; ST_BACKEND=4; ST_FRONT=5; ST_SVC=6; ST_VERIFY=7; ST_DONE=8

WIZ_STATE=()          # pending | active | done | skip | fail  (per stage)
WIZ_DUR=()            # seconds per completed stage
WIZ_STAGE_IDX=-1      # currently active stage
WIZ_STAGE_T0=0
WIZ_SUB=0             # 0..1000 real progress within the active stage
WIZ_RING=()           # log ring buffer: "LEVEL|HH:MM:SS|text"
WIZ_RING_MAX=400
WIZ_T0=0
WIZ_FULL=0            # 1 = full-screen wizard active
WIZ_H=0
WIZ_SPIN_FR=0
WIZ_STAT_LABEL="preparing"
# header chips (plain value + state for coloring)
WIZ_NET="…"   WIZ_NET_S="dim"
WIZ_ROOT="…"  WIZ_ROOT_S="dim"
WIZ_DOCKER="…" WIZ_DOCKER_S="dim"
WIZ_NODE="…"  WIZ_NODE_S="dim"
WIZ_MODE="…"  WIZ_MODE_S="dim"
WIZ_PANELV="…" WIZ_PANELV_S="dim"
WIZ_CHIPS_PLAIN=""
WIZ_RUN_TMP="" WIZ_RUN_OFF=0 WIZ_RUN_PART=""
# layout rows
R_STG=5; R_BAR=15; R_STAT=16; R_LDIV=18; R_LOG0=19; R_FTR=40
WIZ_ROWS_LOG=8
# verification results (filled by stage 8, shown on the success screen)
VERIFY_VERSION="—"
VERIFY_SVC="—"
VERIFY_LOGIN=0

wiz_init_state() {
    local i
    WIZ_STATE=(); WIZ_DUR=()
    for (( i = 0; i < 9; i++ )); do WIZ_STATE[$i]="pending"; WIZ_DUR[$i]=""; done
}

wiz_now() { date '+%H:%M:%S'; }

wiz_elapsed() {
    local s=$(( $(date +%s) - WIZ_T0 ))
    printf '%02d:%02d' $(( s / 60 )) $(( s % 60 ))
}

# real overall percent — derived ONLY from stage/sub-stage completion
wiz_pct() {
    local i=$WIZ_STAGE_IDX
    if [ "$i" -lt 0 ]; then echo 0; return; fi
    local p=$(( ${WIZ_CUM[$i]} + ${WIZ_WEIGHTS[$i]} * WIZ_SUB / 1000 ))
    local cap=$(( ${WIZ_CUM[$i]} + ${WIZ_WEIGHTS[$i]} ))
    [ $p -gt $cap ] && p=$cap
    [ $p -gt 100 ] && p=100
    echo "$p"
}

wiz_ring_push() {  # LEVEL TEXT
    WIZ_RING=( "${WIZ_RING[@]}" "$1|$(wiz_now)|$2" )
    local n=${#WIZ_RING[@]}
    while [ $n -gt $WIZ_RING_MAX ]; do
        WIZ_RING=( "${WIZ_RING[@]:1}" )
        n=$(( n - 1 ))
    done
}

# wlog LEVEL MESSAGE — the wizard's own log line (ok|warn|err|info|step|cmd)
wlog() {
    local lvl="$1" msg="$2" ts ico
    ts=$(wiz_now)
    log "[$lvl] $msg"
    wiz_ring_push "$lvl" "$msg"
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_logs
        wiz_draw_footer
    else
        case "$lvl" in
            ok)   ico="$ICO_OK" ;;
            warn) ico="$ICO_WARN" ;;
            err)  ico="$ICO_FAIL" ;;
            info) ico="$ICO_INFO" ;;
            cmd)  ico="\$" ;;
            *)    ico="$ICO_ARROW" ;;
        esac
        printf '  [%s] %s %s\n' "$ts" "$ico" "$msg"
    fi
}

# ---- absolute-positioned drawing primitives (never print trailing \n!) ------
wiz_eline() { printf '\033[%d;1H%s' "$1" "$CLRL"; }

# colored chip value -> escaped string
wiz_cv() {  # TEXT ok|warn|bad|info|dim
    case "$2" in
        ok)   fg 80 250 123 ;;
        warn) fg 255 200 70 ;;
        bad)  fg 255 85 95 ;;
        info) fg 120 190 255 ;;
        *)    fg 130 145 170 ;;
    esac
    printf '%s' "$FG_OUT$1$RESET"
}

wiz_update_chips() {
    local vn="" vr="" vd="" vno="" vm="" vp=""
    local cn="" cr="" cd="" cno="" cm="" cp=""
    case "$WIZ_NET" in
        online)  vn="● online";  cn=$(wiz_cv "● online" ok) ;;
        offline) vn="○ offline"; cn=$(wiz_cv "○ offline" bad) ;;
        *)       vn="…";         cn=$(wiz_cv "…" dim) ;;
    esac
    case "$WIZ_ROOT" in
        root)    vr="root ✓";  cr=$(wiz_cv "root ✓" ok) ;;
        sudo)    vr="sudo ✓";  cr=$(wiz_cv "sudo ✓" ok) ;;
        user)    vr="user ⚠";  cr=$(wiz_cv "user ⚠" warn) ;;
        *)       vr="…";       cr=$(wiz_cv "…" dim) ;;
    esac
    case "$WIZ_DOCKER" in
        yes)     vd="docker ✓";  cd=$(wiz_cv "docker ✓" ok) ;;
        no)      vd="docker ✗";  cd=$(wiz_cv "docker ✗" bad) ;;
        *)       vd="docker …";  cd=$(wiz_cv "docker …" dim) ;;
    esac
    case "$WIZ_NODE" in
        v*)      vno="node $WIZ_NODE";  cno=$(wiz_cv "node $WIZ_NODE" ok) ;;
        none)    vno="node ✗";         cno=$(wiz_cv "node ✗" bad) ;;
        *)       vno="node …";          cno=$(wiz_cv "node …" dim) ;;
    esac
    case "$WIZ_MODE" in
        docker)  vm="mode docker";  cm=$(wiz_cv "mode docker" info) ;;
        node)    vm="mode node";    cm=$(wiz_cv "mode node" info) ;;
        *)       vm="mode …";       cm=$(wiz_cv "mode …" dim) ;;
    esac
    case "$WIZ_PANELV" in
        v*)      vp="panel $WIZ_PANELV";  cp=$(wiz_cv "panel $WIZ_PANELV" info) ;;
        *)       vp="panel …";            cp=$(wiz_cv "panel …" dim) ;;
    esac
    # progressive chip fitting: keep as many chips as the header width
    # allows, dropping from the right (panel → node → mode → docker …)
    local vals=( "$vn" "$vr" "$vd" "$vm" "$vno" "$vp" )
    local cvals=( "$cn" "$cr" "$cd" "$cm" "$cno" "$cp" )
    local avail=$(( W - 2 - 46 - 2 ))
    local used=0 k piece plain="" colored="" add
    for k in 0 1 2 3 4 5; do
        piece="${vals[$k]}"
        if [ -n "$plain" ]; then add=$(( ${#piece} + 3 )); else add=${#piece}; fi
        if [ $(( used + add )) -gt $avail ]; then break; fi
        if [ -n "$plain" ]; then
            plain="$plain · "
            colored="$colored · "
            used=$(( used + 3 ))
        fi
        plain="$plain$piece"
        colored="$colored${cvals[$k]}"
        used=$(( used + ${#piece} ))
    done
    if [ -z "$plain" ]; then
        plain="$vn"
        colored="$cn"
    fi
    WIZ_CHIPS_PLAIN="$plain"
    WIZ_CHIPS_COLOR="$colored"
}

wiz_draw_header() {
    [ "$WIZ_FULL" = "1" ] || return 0
    local inner=$(( W - 2 )) i
    # top border (blue -> purple gradient)
    wiz_eline 1
    printf ' '
    grad_print "$B_TL" 56 120 255 56 120 255
    for (( i = 0; i < inner; i++ )); do
        fg $(( 56 + ( 139 - 56 ) * i / ( inner + 1 ) )) \
           $(( 120 + ( 92 - 120 ) * i / ( inner + 1 ) )) \
           $(( 255 + ( 246 - 255 ) * i / ( inner + 1 ) ))
        printf '%s%s' "$FG_OUT" "$B_H"
    done
    grad_print "$B_TR" 139 92 246 139 92 246
    # title row
    wiz_eline 2
    printf ' '
    grad_print "$B_V" 90 140 230 139 92 246
    printf ' %s ' "$BRAND_ICO"
    grad_print "PROTO PANEL" 90 140 255 139 92 246
    printf '%s' "$DIM"
    printf ' INSTALLATION WIZARD  v%s' "$INSTALLER_VER"
    printf '%s' "$RESET"
    # right-aligned live status chips (already width-fitted)
    local pad=$(( ( W - 2 ) - 46 - 2 - ${#WIZ_CHIPS_PLAIN} ))
    [ $pad -lt 1 ] && pad=1
    printf '%*s' "$pad" ""
    printf '%s' "$WIZ_CHIPS_COLOR"
    printf ' '
    grad_print "$B_V" 90 140 230 139 92 246
    # bottom border (purple -> blue)
    wiz_eline 3
    printf ' '
    grad_print "$B_BL" 139 92 246 139 92 246
    for (( i = 0; i < inner; i++ )); do
        fg $(( 139 - ( 139 - 56 ) * i / ( inner + 1 ) )) \
           $(( 92 + ( 120 - 92 ) * i / ( inner + 1 ) )) \
           $(( 246 + ( 255 - 246 ) * i / ( inner + 1 ) ))
        printf '%s%s' "$FG_OUT" "$B_H"
    done
    grad_print "$B_BR" 56 120 255 56 120 255
    return 0
}

wiz_draw_stages() {
    [ "$WIZ_FULL" = "1" ] || return 0
    local i row=$R_STG st name
    for (( i = 0; i < 9; i++ )); do
        wiz_eline $(( row + i ))
        printf '  '
        st="${WIZ_STATE[$i]:-pending}"
        name="${WIZ_STAGES[$i]}"
        case "$st" in
            done)
                fg_ok; printf '%s ' "$ICO_OK"; printf '%s' "$RESET"
                printf '%d ' $(( i + 1 ))
                fg 225 232 255; printf '%s%s' "$BOLD$FG_OUT" "$name"
                if [ -n "${WIZ_DUR[$i]:-}" ]; then
                    printf '%s' "$DIM"
                    printf '   (%ss)' "${WIZ_DUR[$i]}"
                    printf '%s' "$RESET"
                else
                    printf '%s' "$RESET"
                fi
                ;;
            active)
                printf '%s ' "${SPIN[$(( WIZ_SPIN_FR % ${#SPIN[@]} ))]}"
                printf '%d ' $(( i + 1 ))
                printf '%s' "$BOLD"
                grad_print "$name" 110 200 255 139 92 246
                printf '%s' "$RESET"
                printf '%s' "$DIM"
                printf '  %d%% of stage' $(( WIZ_SUB / 10 ))
                printf '%s' "$RESET"
                ;;
            skip)
                printf '%s ' "$SKIP_ICO"
                printf '%d ' $(( i + 1 ))
                printf '%s' "$DIM"
                fg 120 200 230
                printf '%s' "$name (skipped)"
                printf '%s' "$RESET"
                ;;
            fail)
                fg_fail; printf '%s ' "$ICO_FAIL"; printf '%s' "$RESET"
                printf '%d ' $(( i + 1 ))
                fg_fail; printf '%s%s' "$BOLD$FG_OUT" "$name$RESET"
                ;;
            *)
                printf '%s' "$DIM"
                printf '%s ' "$PEND_ICO"
                printf '%d ' $(( i + 1 ))
                printf '%s' "$name"
                printf '%s' "$RESET"
                ;;
        esac
    done
    return 0
}

wiz_draw_bar() {
    [ "$WIZ_FULL" = "1" ] || return 0
    local pct; pct=$(wiz_pct)
    wiz_eline $R_BAR
    printf '  '
    local bw=$(( W - 18 ))
    [ $bw -gt 46 ] && bw=46
    [ $bw -lt 12 ] && bw=12
    local fill=$(( pct * bw / 100 )) j r g b half
    half=$(( bw / 2 ))
    local tip_on=0
    if [ $WIZ_STAGE_IDX -ge 0 ] && [ "${WIZ_STATE[$WIZ_STAGE_IDX]}" = "active" ] \
       && [ $fill -lt $bw ]; then
        tip_on=1
    fi
    for (( j = 0; j < bw; j++ )); do
        if [ $j -lt $fill ]; then
            # piecewise blue -> cyan -> purple (the panel's brand gradient)
            if [ $j -le $half ]; then
                r=$(( 56 + ( 34 - 56 ) * j / ( half + 1 ) ))
                g=$(( 120 + ( 211 - 120 ) * j / ( half + 1 ) ))
                b=$(( 255 + ( 238 - 255 ) * j / ( half + 1 ) ))
            else
                r=$(( 34 + ( 139 - 34 ) * ( j - half ) / ( bw - half + 1 ) ))
                g=$(( 211 + ( 92 - 211 ) * ( j - half ) / ( bw - half + 1 ) ))
                b=$(( 238 + ( 246 - 238 ) * ( j - half ) / ( bw - half + 1 ) ))
            fi
            fg $r $g $b
            printf '%s%s' "$FG_OUT" "$BLK_F"
        elif [ $j -eq $fill ] && [ $tip_on = 1 ]; then
            # glowing tip — pulses while a stage is really running
            if [ $(( WIZ_SPIN_FR % 2 )) -eq 0 ]; then fg 235 250 255
            else fg 139 92 246; fi
            printf '%s%s' "$BOLD$FG_OUT" "$BLK_F"
        else
            printf '%s%s' "$DIM" "$BLK_E"
        fi
    done
    printf '%s' "$RESET"
    printf ' '
    if [ "$pct" -ge 100 ]; then fg_ok; else fg 235 240 255; fi
    printf '%s%3d%%%s' "$BOLD$FG_OUT" "$pct" "$RESET"
    return 0
}

wiz_draw_status() {
    [ "$WIZ_FULL" = "1" ] || return 0
    wiz_eline $R_STAT
    printf '  %s ' "${SPIN[$(( WIZ_SPIN_FR % ${#SPIN[@]} ))]}"
    if [ $WIZ_STAGE_IDX -ge 0 ]; then
        grad_print "Stage $(( WIZ_STAGE_IDX + 1 ))/9 · ${WIZ_STAGES[$WIZ_STAGE_IDX]}" 110 200 255 139 92 246
    else
        grad_print "Starting" 110 200 255 139 92 246
    fi
    local label="$WIZ_STAT_LABEL"
    local maxw=$(( W - 42 ))
    [ $maxw -lt 12 ] && maxw=12
    [ ${#label} -gt $maxw ] && label="${label:0:$(( maxw - 1 ))}$ELLIPSIS"
    printf '%s' "$DIM"
    fg 120 135 160
    printf '  —  %s' "$label"
    printf '    %s' "$(wiz_elapsed)"
    printf '%s' "$RESET"
    return 0
}

wiz_draw_ldiv() {
    [ "$WIZ_FULL" = "1" ] || return 0
    wiz_eline $R_LDIV
    printf '  %s' "$DIM"
    fg 70 90 130
    local t=" live log " rest i
    rest=$(( W - 4 - ${#t} - 2 ))
    [ $rest -lt 0 ] && rest=0
    printf '%s' "$LN_D$LN_D$t"
    for (( i = 0; i < rest; i++ )); do printf '%s' "$LN_D"; done
    printf '%s' "$RESET"
    return 0
}

wiz_draw_logs() {
    [ "$WIZ_FULL" = "1" ] || return 0
    local n=${#WIZ_RING[@]}
    local start=$(( n - WIZ_ROWS_LOG ))
    [ $start -lt 0 ] && start=0
    local row=$R_LOG0 i=$start e lvl rest ts msg ico maxw
    maxw=$(( W - 15 ))
    [ $maxw -lt 20 ] && maxw=20
    while [ $i -lt $n ]; do
        e="${WIZ_RING[$i]}"
        lvl="${e%%|*}"
        rest="${e#*|}"
        ts="${rest%%|*}"
        msg="${rest#*|}"
        wiz_eline $row
        printf ' '
        printf '%s' "$DIM"
        fg 95 110 140
        printf '[%s]%s' "$ts" "$RESET"
        case "$lvl" in
            ok)   fg_ok;   ico="$ICO_OK" ;;
            warn) fg_warn; ico="$ICO_WARN" ;;
            err)  fg_fail; ico="$ICO_FAIL" ;;
            info) fg_info; ico="$ICO_INFO" ;;
            cmd)  fg 170 140 255; ico='$' ;;
            step) fg 140 200 255; ico="$ICO_ARROW" ;;
            out)  printf '%s' "$DIM"; fg 120 135 160; ico='·' ;;
            *)    printf '%s' "$DIM"; ico='·' ;;
        esac
        printf ' %s %s' "$ico" "$RESET"
        if [ ${#msg} -gt $maxw ]; then
            msg="${msg:0:$(( maxw - 1 ))}$ELLIPSIS"
        fi
        if [ "$lvl" = "out" ]; then
            printf '%s%s' "$DIM$FG_OUT" "$msg$RESET"
        else
            printf '%s' "$msg"
        fi
        row=$(( row + 1 ))
        i=$(( i + 1 ))
    done
    # clear the rest of the pane
    while [ $row -lt $R_FTR ]; do
        wiz_eline $row
        row=$(( row + 1 ))
    done
    return 0
}

wiz_draw_footer() {
    [ "$WIZ_FULL" = "1" ] || return 0
    local pct; pct=$(wiz_pct)
    wiz_eline $R_FTR
    local sname="—"
    [ $WIZ_STAGE_IDX -ge 0 ] && sname="${WIZ_STAGES[$WIZ_STAGE_IDX]}"
    local left=" $pct% · stage $(( WIZ_STAGE_IDX + 1 ))/9 · $sname "
    [ $WIZ_STAGE_IDX -lt 0 ] && left=" $pct% · starting "
    local right=" elapsed $(wiz_elapsed) · log $(basename "$LOG") "
    local fill=$(( W - ${#left} - ${#right} - 1 ))
    [ $fill -lt 1 ] && fill=1
    printf '%s' "$DIM"
    fg 70 90 130
    printf '%s' "$left"
    local i
    for (( i = 0; i < fill; i++ )); do printf '%s' "$LN_D"; done
    printf '%s' "$right"
    printf '%s' "$RESET"
    return 0
}

wiz_draw_static()  { wiz_draw_header; wiz_draw_stages; wiz_draw_ldiv; }
wiz_draw_dynamic() { wiz_draw_bar; wiz_draw_status; wiz_draw_logs; wiz_draw_footer; }
wiz_redraw()       { wiz_draw_static; wiz_draw_dynamic; }

# ---- full-screen lifecycle ---------------------------------------------------

wiz_can_full() {
    [ "$OPT_WIZARD" = "1" ] || return 1
    [ "$FX" = "1" ] || return 1
    local h w
    h=$(tput lines 2>/dev/null || echo 0)
    w=$(tput cols 2>/dev/null || echo 0)
    case "$h" in ''|*[!0-9]*) return 1 ;; esac
    case "$w" in ''|*[!0-9]*) return 1 ;; esac
    [ "$h" -ge 27 ] && [ "$w" -ge 64 ]
}

wiz_layout() {
    WIZ_H=$(tput lines 2>/dev/null || echo "$WIZ_H")
    W=$(tput cols 2>/dev/null || echo "$W")
    case "$WIZ_H" in ''|*[!0-9]*) WIZ_H=40 ;; esac
    case "$W"     in ''|*[!0-9]*) W=80 ;; esac
    [ "$WIZ_H" -lt 27 ] && WIZ_H=27
    [ "$W" -lt 64 ] && W=64
    R_STG=5
    R_BAR=$(( R_STG + 9 + 1 ))
    R_STAT=$(( R_BAR + 1 ))
    R_LDIV=$(( R_STAT + 2 ))
    R_LOG0=$(( R_LDIV + 1 ))
    R_FTR=$WIZ_H
    WIZ_ROWS_LOG=$(( R_FTR - R_LOG0 ))
    [ $WIZ_ROWS_LOG -lt 4 ] && WIZ_ROWS_LOG=4
}

wiz_enter() {
    if wiz_can_full; then
        wiz_layout
        WIZ_FULL=1
        cur_hide
        printf '\033[?1049h\033[H\033[2J'
        wiz_redraw
    else
        WIZ_FULL=0
        wiz_flow_header
    fi
    return 0
}

wiz_leave() {
    if [ "$WIZ_FULL" = "1" ]; then
        cur_show
        printf '\033[?1049l'
        WIZ_FULL=0
    fi
    return 0
}

# flowing fallback header (CI pipes, tiny consoles, --no-wizard)
wiz_flow_header() {
    scan_sweep 1
    printf '  '
    grad_print "PROTO PANEL — INSTALLATION WIZARD v$INSTALLER_VER" 90 140 255 139 92 246
    printf '\n'
    scan_sweep 1
}

# flowing fallback: chips line printed at each stage start
wiz_flow_chips() {
    [ "$WIZ_FULL" = "1" ] && return 0
    printf '  %s' "$DIM"
    printf '%s' "$WIZ_CHIPS_PLAIN"
    printf '%s\n' "$RESET"
    return 0
}

# ---- stage control ------------------------------------------------------------

wiz_stage_begin() {  # IDX
    WIZ_STAGE_IDX=$1
    WIZ_SUB=0
    WIZ_STAT_LABEL="starting"
    WIZ_STAGE_T0=$(date +%s)
    local i
    for (( i = 0; i < 9; i++ )); do
        [ "${WIZ_STATE[$i]:-pending}" = "active" ] && WIZ_STATE[$i]="pending"
    done
    WIZ_STATE[$1]="active"
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_stages
        wiz_draw_bar
        wiz_draw_status
        wiz_draw_footer
    else
        printf '\n  '
        grad_print "STAGE $(( $1 + 1 ))/9 · ${WIZ_STAGES[$1]}" 110 200 255 139 92 246
        printf '%s\n' "$RESET"
        wiz_flow_chips
    fi
    wlog info "stage $(( $1 + 1 ))/9 — ${WIZ_STAGES[$1]}"
}

wiz_stage_done() {
    local i=$WIZ_STAGE_IDX
    [ $i -lt 0 ] && return 0
    WIZ_STATE[$i]="done"
    WIZ_SUB=1000
    WIZ_DUR[$i]=$(( $(date +%s) - WIZ_STAGE_T0 ))
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_stages
        wiz_draw_bar
        wiz_draw_status
        wiz_draw_footer
    fi
    wlog ok "${WIZ_STAGES[$i]} complete — $(wiz_pct)% overall"
    return 0
}

wiz_stage_skip() {  # REASON
    local i=$WIZ_STAGE_IDX
    [ $i -lt 0 ] && return 0
    WIZ_STATE[$i]="skip"
    WIZ_DUR[$i]=0
    WIZ_SUB=1000
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_stages
        wiz_draw_bar
        wiz_draw_footer
    fi
    wlog info "skipped — $1"
    return 0
}

wiz_sub() {  # PERMILLE [LABEL]
    WIZ_SUB=$1
    if [ -n "${2:-}" ]; then WIZ_STAT_LABEL="$2"; fi
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_stages
        wiz_draw_bar
        wiz_draw_status
        wiz_draw_footer
    fi
    return 0
}

wiz_label() {  # LABEL
    WIZ_STAT_LABEL="$1"
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_status
    fi
    return 0
}

# ---- command runner with REAL-TIME streamed logs ------------------------------

wiz_drain_output() {  # push newly written command output into the ring/log
    [ -n "$WIZ_RUN_TMP" ] || return 0
    local sz chunk line
    sz=$(wc -c < "$WIZ_RUN_TMP" 2>/dev/null | tr -d ' ')
    case "$sz" in ''|*[!0-9]*) sz=0 ;; esac
    [ "$sz" -le "$WIZ_RUN_OFF" ] && return 0
    chunk="${WIZ_RUN_PART}$(tail -c +$(( WIZ_RUN_OFF + 1 )) "$WIZ_RUN_TMP" 2>/dev/null)"
    WIZ_RUN_OFF=$sz
    WIZ_RUN_PART=""
    case "$chunk" in
        *$'\n') ;;
        *) WIZ_RUN_PART="$chunk"; return 0 ;;   # only a partial line so far
    esac
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        # strip ANSI color codes / carriage returns, cap the length
        line=$(printf '%s' "$line" | tr -d '\r' | sed "s/$E\[[0-9;?]*[a-zA-Z]//g")
        [ ${#line} -gt 200 ] && line="${line:0:200}"
        printf '%s\n' "$line" >> "$LOG"
        if [ "$WIZ_FULL" = "1" ]; then
            wiz_ring_push "out" "$line"
        else
            printf '%s%s%s\n' "$DIM" "$line" "$RESET"
        fi
    done <<< "$chunk"
    return 0
}

wiz_tick() {  # LABEL — one animation frame while a command runs
    wiz_drain_output
    WIZ_SPIN_FR=$(( WIZ_SPIN_FR + 1 ))
    WIZ_STAT_LABEL="$1"
    if [ "$WIZ_FULL" = "1" ]; then
        # occasionally notice terminal resizes and re-layout
        if [ $(( WIZ_SPIN_FR % 24 )) -eq 0 ]; then
            local nh nw
            nh=$(tput lines 2>/dev/null || echo 0)
            nw=$(tput cols 2>/dev/null || echo 0)
            case "$nh" in ''|*[!0-9]*) nh=0 ;; esac
            case "$nw" in ''|*[!0-9]*) nw=0 ;; esac
            if [ "$nh" != "$WIZ_H" ] || [ "$nw" != "$W" ]; then
                if [ "$nh" -ge 27 ] && [ "$nw" -ge 64 ]; then
                    wiz_layout
                    printf '\033[H\033[2J'
                    wiz_redraw
                else
                    wiz_leave
                    wlog warn "terminal too small for the wizard — switching to plain output"
                fi
            fi
        fi
        wiz_draw_bar
        wiz_draw_status
        wiz_draw_logs
        wiz_draw_footer
    fi
    return 0
}

# wiz_run "label" [--mask] [--stream] -- cmd...
#   Runs the command for real, streams its output into the live log pane,
#   reports the real exit code and elapsed time. Never fakes success.
wiz_run() {
    local label="$1" mask=0 stream=0
    shift
    while [ $# -gt 0 ] && [ "${1:-}" != "--" ]; do
        case "$1" in
            --mask)   mask=1 ;;
            --stream) stream=1 ;;
        esac
        shift
    done
    [ "${1:-}" = "--" ] && shift
    if [ "$OPT_DRY" = "1" ]; then
        wlog info "$label [dry-run · skipped]"
        return 0
    fi
    if [ "$mask" = "1" ]; then
        wlog cmd "$label (credentials hidden)"
        log "RUN: (credentials hidden)"
    else
        wlog cmd "$*"
        log "RUN: $*"
    fi
    if [ "$stream" != "1" ]; then
        # quiet mode: keep the pane clean, output still goes to the log file
        wlog info "$label …"
    fi
    local t0 el rc=0 pid
    t0=$(date +%s)
    WIZ_RUN_TMP=$(mktemp "${TMPDIR:-/tmp}/proto-run.XXXXXX")
    WIZ_RUN_OFF=0
    WIZ_RUN_PART=""
    "$@" > "$WIZ_RUN_TMP" 2>&1 &
    pid=$!
    BG_PID=$pid
    while kill -0 "$pid" 2>/dev/null; do
        wiz_tick "$label"
        sleep 0.15
    done
    wait "$pid" || rc=$?
    BG_PID=""
    wiz_tick "$label"
    wiz_drain_output
    el=$(( $(date +%s) - t0 ))
    rm -f "$WIZ_RUN_TMP" 2>/dev/null
    WIZ_RUN_TMP=""
    if [ "$rc" -eq 0 ]; then
        wlog ok "$label (${el}s)"
    else
        wlog err "$label failed (exit $rc)"
        # surface the real tail of the failed command in the pane
        local tailn=0 e lvl rest msg
        local n=${#WIZ_RING[@]}
        local start=$(( n - 6 ))
        [ $start -lt 0 ] && start=0
        local i=$start
        while [ $i -lt $n ]; do
            e="${WIZ_RING[$i]}"
            lvl="${e%%|*}"
            if [ "$lvl" = "out" ]; then tailn=$(( tailn + 1 )); fi
            i=$(( i + 1 ))
        done
    fi
    return "$rc"
}

# wiz_run_live "label" -- cmd...  (interactive commands, e.g. sudo password)
wiz_run_live() {
    local label="$1"
    shift
    while [ $# -gt 0 ] && [ "${1:-}" != "--" ]; do shift; done
    [ "${1:-}" = "--" ] && shift
    if [ "$OPT_DRY" = "1" ]; then
        wlog info "$label [dry-run · skipped]"
        return 0
    fi
    wlog cmd "$label (interactive — a password may be asked)"
    log "RUN(live): $*"
    local was_full=$WIZ_FULL
    wiz_leave
    cur_show
    printf '  %s %s %s\n' "$ICO_WARN" "$label" "$DIM(this step may ask for your sudo password)$RESET"
    local rc=0
    "$@" 2>&1 | tee -a "$LOG"
    rc=${PIPESTATUS[0]}
    if [ "$rc" -eq 0 ]; then
        printf '  %s %s\n' "$ICO_OK" "$label"
    else
        printf '  %s %s [FAILED]\n' "$ICO_FAIL" "$label"
    fi
    if [ "$was_full" = "1" ]; then
        wiz_enter
    fi
    if [ "$rc" -eq 0 ]; then
        wlog ok "$label"
    else
        wlog err "$label failed (exit $rc)"
    fi
    return "$rc"
}

# ============================================================================
#  SECTION 7 · THE NINE STAGES (real pipeline, real progress)
# ============================================================================

# ---- stage 1 · system requirements ------------------------------------------
stage_sysreq() {
    wiz_stage_begin $ST_SYSREQ
    local os arch kernel cpu mem disk
    os="unknown"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        os="${PRETTY_NAME:-${NAME:-Linux}}"
    else
        os=$(uname -s 2>/dev/null || echo unknown)
    fi
    arch=$(uname -m 2>/dev/null || echo "?")
    kernel=$(uname -r 2>/dev/null || echo "?")
    cpu=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "?")
    mem=$(free -h 2>/dev/null | awk '/^Mem:/{print $3 " / " $2}')
    [ -z "$mem" ] && mem="N/A"
    disk=$(df -Ph / 2>/dev/null | awk 'NR==2{print $4 " free"}')
    [ -z "$disk" ] && disk="N/A"
    SYS_IP=$(get_sys_ip)
    wlog info "OS          $os"
    wlog info "kernel      $kernel ($arch)"
    wlog info "cpu / ram   $cpu cores · $mem"
    wlog info "disk        $disk"
    wlog info "address     $SYS_IP"
    wiz_sub 150 "checking privileges"
    if [ "$(id -u)" = "0" ]; then
        WIZ_ROOT="root"; wlog ok "running as root"
    elif sudo_nonint; then
        WIZ_ROOT="sudo"; wlog ok "passwordless sudo available"
    else
        WIZ_ROOT="user"
        wlog warn "unprivileged user — some steps may ask for a sudo password"
    fi
    wiz_update_chips; wiz_draw_header
    wiz_sub 250 "checking internet"
    if curl -sI -m 4 https://nodejs.org >/dev/null 2>&1; then
        WIZ_NET="online"; wlog ok "internet reachable"
    else
        WIZ_NET="offline"
        wlog warn "no internet — a local source (zip/folder) will be required"
    fi
    wiz_update_chips; wiz_draw_header
    wiz_sub 350 "checking base tools"
    local need="" c mgr
    for c in curl git tar unzip; do have "$c" || need="$need $c"; done
    if [ -n "$need" ]; then
        wlog warn "missing tools:$need — installing them"
        mgr=$(pkg_mgr)
        if [ "$mgr" = "none" ]; then
            die "missing required tools:$need and no supported package manager was found" "stage 1 · system requirements"
        fi
        if sudo_nonint || [ "$(id -u)" = "0" ]; then
            case "$mgr" in
                apt)    wiz_run "install$need via apt"    --stream -- run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q $need ca-certificates ;;
                dnf)    wiz_run "install$need via dnf"    --stream -- run_root dnf install -y -q $need ;;
                yum)    wiz_run "install$need via yum"    --stream -- run_root yum install -y -q $need ;;
                pacman) wiz_run "install$need via pacman" --stream -- run_root pacman -S --noconfirm --needed $need ;;
                zypper) wiz_run "install$need via zypper" --stream -- run_root zypper -n in $need ;;
                apk)    wiz_run "install$need via apk"    --stream -- run_root apk add --no-cache $need ;;
            esac || die "could not install required tools:$need" "stage 1 · system requirements"
        else
            # sudo may need a password — run visibly in the foreground
            case "$mgr" in
                apt)    wiz_run_live "install$need via apt"    -- run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q $need ca-certificates ;;
                dnf)    wiz_run_live "install$need via dnf"    -- run_root dnf install -y -q $need ;;
                yum)    wiz_run_live "install$need via yum"    -- run_root yum install -y -q $need ;;
                pacman) wiz_run_live "install$need via pacman" -- run_root pacman -S --noconfirm --needed $need ;;
                zypper) wiz_run_live "install$need via zypper" -- run_root zypper -n in $need ;;
                apk)    wiz_run_live "install$need via apk"    -- run_root apk add --no-cache $need ;;
            esac || die "could not install required tools:$need (password wrong?)" "stage 1 · system requirements"
        fi
    else
        wlog ok "base tools present (curl, git, tar, unzip)"
    fi
    wiz_sub 700 "checking memory"
    # swap guard for low-memory boxes (real fix, logged honestly)
    local tm ts
    tm=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')
    ts=$(free -m 2>/dev/null | awk '/^Swap:/{print $2}')
    if [ -n "$tm" ] && [ "$tm" -lt 2000 ] && { [ -z "$ts" ] || [ "$ts" -lt 512 ]; }; then
        wlog warn "low memory (${tm}MB ram, ${ts:-0}MB swap) — preparing a 2G swapfile"
        log "low memory (${tm}MB, swap ${ts:-0}MB) — attempting swapfile"
        if [ "$OPT_DRY" != "1" ] && have fallocate && sudo_nonint; then
            if [ ! -f /swapfile ]; then
                run_root fallocate -l 2G /swapfile >> "$LOG" 2>&1
                run_root chmod 600 /swapfile >> "$LOG" 2>&1
                run_root mkswap /swapfile >> "$LOG" 2>&1
            fi
            if run_root swapon /swapfile >> "$LOG" 2>&1; then
                wlog ok "swapfile enabled"
            else
                wlog warn "swapfile could not be enabled (already on?)"
            fi
        fi
    else
        wlog ok "memory ok"
    fi
    wiz_sub 900 "checking port :$PANEL_PORT"
    if curl -s -m 2 "http://127.0.0.1:$PANEL_PORT/api/health" 2>/dev/null | grep -q 'Proto Panel'; then
        wlog warn "a Proto Panel already answers on :$PANEL_PORT — did you mean --update?"
    else
        wlog ok "port :$PANEL_PORT is free for the panel"
    fi
    wiz_stage_done
}

# ---- stage 2 · dependencies (mode decision + node.js / docker) ---------------
install_node_wiz() {
    local arch narch dist
    arch=$(uname -m)
    case "$arch" in
        x86_64)        narch="x64" ;;
        aarch64|arm64) narch="arm64" ;;
        armv7l)        narch="armv7l" ;;
        *)             narch="x64" ;;
    esac
    dist="node-v22.13.1-linux-$narch"
    if [ "$OPT_DRY" = "1" ]; then
        wlog info "node.js 22 ($narch) install [dry-run · skipped]"
        return 0
    fi
    wiz_run "installing node.js 22 ($narch)" --stream -- bash -c \
        "curl -fsSL https://nodejs.org/dist/v22.13.1/$dist.tar.xz -o /tmp/node22.tar.xz && tar -xJf /tmp/node22.tar.xz -C /usr/local --strip-components=1 && rm -f /tmp/node22.tar.xz" \
        || return 1
    have node || return 1
    have npm  || return 1
    return 0
}

detect_mode_wiz() {
    local d
    if [ "$OPT_MODE" != "auto" ]; then
        INSTALL_MODE="$OPT_MODE"
        if [ "$INSTALL_MODE" = "docker" ]; then
            d=$(get_docker_cmd)
            if ! have docker; then
                wlog info "docker requested but missing — installing it"
                wiz_run "install docker (get.docker.com)" --stream -- bash -c 'curl -fsSL https://get.docker.com | sh'
            fi
            d=$(get_docker_cmd)
            if have docker; then
                if $d info >/dev/null 2>&1; then
                    :
                elif [ "$(id -u)" = "0" ] || sudo_nonint; then
                    wiz_run "starting docker daemon" -- run_root systemctl enable --now docker || true
                else
                    wlog warn "docker installed but daemon not reachable (start it manually if needed)"
                fi
            elif [ "$OPT_DRY" = "1" ]; then
                wlog info "dry-run: docker unavailable here — rehearsing in node mode"
                INSTALL_MODE="node"
            else
                die "--mode=docker was requested but Docker could not be installed" "stage 2 · dependencies"
            fi
        fi
        return 0
    fi
    d=$(get_docker_cmd)
    if have docker && $d info >/dev/null 2>&1; then
        INSTALL_MODE="docker"
        return 0
    fi
    if [ "$(id -u)" = "0" ] || sudo_nonint; then
        wiz_run "docker not found — installing it" --stream -- bash -c 'curl -fsSL https://get.docker.com | sh'
        d=$(get_docker_cmd)
        if have docker && $d info >/dev/null 2>&1; then
            INSTALL_MODE="docker"
            return 0
        fi
    fi
    INSTALL_MODE="node"
}

stage_deps() {
    wiz_stage_begin $ST_DEPS
    # docker chip state (refreshed for the header)
    if have docker && $(get_docker_cmd) info >/dev/null 2>&1; then
        WIZ_DOCKER="yes"
    elif have docker; then
        WIZ_DOCKER="yes"
    else
        WIZ_DOCKER="no"
    fi
    wiz_sub 100 "choosing deployment mode"
    detect_mode_wiz
    WIZ_MODE="$INSTALL_MODE"
    wiz_update_chips; wiz_draw_header
    wlog info "deployment mode: $INSTALL_MODE"
    if [ "$INSTALL_MODE" = "node" ]; then
        wiz_sub 300 "checking node.js"
        local need=0 vmaj
        if have node; then
            vmaj=$(node -v 2>/dev/null | tr -d 'v' | cut -d. -f1)
            case "$vmaj" in ''|*[!0-9]*) need=1 ;; *) [ "$vmaj" -lt 20 ] && need=1 ;; esac
        else
            need=1
        fi
        if [ "$need" = "0" ]; then
            WIZ_NODE="v$(node -v 2>/dev/null | tr -d v)"
            wlog ok "node.js $(node -v) · npm $(npm -v 2>/dev/null || echo '?')"
        else
            wlog info "node.js >= 20 required — installing v22"
            install_node_wiz \
                || die "Node.js >= 20 (with npm) is required and could not be installed" "stage 2 · dependencies"
            if have node; then
                WIZ_NODE="v$(node -v 2>/dev/null | tr -d v)"
                wlog ok "node.js $(node -v) installed"
            else
                WIZ_NODE="none"
            fi
        fi
        wiz_update_chips; wiz_draw_header
        wiz_sub 900 "final checks"
        have npm || die "npm is still missing after the node.js install" "stage 2 · dependencies"
    else
        # docker mode: node is not needed on the host — the image brings its own
        if have node; then
            WIZ_NODE="v$(node -v 2>/dev/null | tr -d v)"
            wlog info "host node.js $(node -v) (not required in docker mode)"
        else
            WIZ_NODE="none"
            wlog info "docker mode — node.js runs inside the container, none needed on the host"
        fi
        wiz_update_chips; wiz_draw_header
        wiz_sub 900 "final checks"
    fi
    wiz_stage_done
}

# ---- stage 3 · environment (source + scaffolding) ----------------------------
stage_dry_sandbox() {
    DRY_SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/proto-dry.XXXXXX") \
        || die "could not create a dry-run sandbox" "stage 3 · environment"
    WORK_DIR="$DRY_SANDBOX"
    printf '%s\n' '{ "name": "proto-panel", "version": "0.0.0-dryrun", "private": true }' \
        > "$DRY_SANDBOX/package.json"
    wlog info "dry-run: staging a throwaway sandbox (no download, no changes)"
    log "DRY-RUN: sandbox $DRY_SANDBOX ($1)"
}

unpack_zip_source() {
    local zip="$1" dest cand
    have unzip || die "unzip is required to install from a zip archive" "stage 3 · environment"
    if [ -d Proto ] && [ -f Proto/package.json ]; then
        dest="Proto-src"
    else
        dest="Proto"
    fi
    rm -rf "$dest"
    wiz_run "unpacking $(basename "$zip")" --stream -- unzip -q "$zip" -d "$dest" \
        || { rm -rf "$dest"; die "could not unpack $zip" "stage 3 · environment"; }
    WORK_DIR=""
    if [ -f "$dest/package.json" ]; then
        WORK_DIR="$dest"
    else
        for cand in "$dest"/*/; do
            if [ -f "${cand}package.json" ]; then WORK_DIR="${cand%/}"; break; fi
        done
    fi
    if [ -n "$WORK_DIR" ] && [ -f "$WORK_DIR/package.json" ]; then
        wlog ok "source unpacked to ./$WORK_DIR"
    else
        rm -rf "$dest"
        die "no package.json found inside $zip" "stage 3 · environment"
    fi
}

write_docker_files() {
    [ "$OPT_DRY" = "1" ] && { log "dry-run: skip writing docker files"; return 0; }
    if [ ! -f Dockerfile ]; then
        cat > Dockerfile << 'DEOF'
FROM node:22-alpine
RUN apk add --no-cache docker-cli git make g++ python3 curl
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN if [ ! -f "dist/server.cjs" ] || [ ! -f "dist/index.html" ]; then NODE_OPTIONS="--max-old-space-size=2048" npm run build; fi
EXPOSE 6767 6868
CMD ["npm", "start"]
DEOF
    fi
    if [ ! -f docker-compose.yml ]; then
        cat > docker-compose.yml << 'CEOF'
version: '3.8'
services:
  proto-main:
    build: .
    container_name: proto-main
    restart: unless-stopped
    ports:
      - "6767:6767"
      - "6868:6868"
    environment:
      - NODE_ENV=production
      - PORT=6767
      - PROTO_HOST_DATA_PATH=${PWD}/.data
      - PROTO_OWNER_USER=${PROTO_OWNER_USER:-}
      - PROTO_OWNER_PASS=${PROTO_OWNER_PASS:-}
    volumes:
      - ./.data:/app/.data
      - ./backups:/app/backups
      - /var/run/docker.sock:/var/run/docker.sock
CEOF
    fi
    return 0
}

write_node_files() {
    [ "$OPT_DRY" = "1" ] && { log "dry-run: skip writing ecosystem"; return 0; }
    cat > ecosystem.config.cjs << 'NEOF'
module.exports = {
  apps: [
    {
      name: "proto-main",
      script: "npm",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 6767,
        DEFAULT_RUNTIME: "docker",
        ENABLE_DOCKER: "true",
        DOCKER_SOCKET_PATH: "/var/run/docker.sock"
      }
    }
  ]
};
NEOF
    return 0
}

stage_env() {
    wiz_stage_begin $ST_ENV
    wiz_sub 50 "locating panel source"
    if [ -n "$SRC_ARG" ]; then
        if [ "$OPT_DRY" = "1" ]; then
            stage_dry_sandbox "source '$SRC_ARG' unpack [dry-run · skipped]"
            WIZ_C_SRC="dry"
        elif [ -f "$SRC_ARG" ]; then
            case "$SRC_ARG" in
                *.zip|*.ZIP) unpack_zip_source "$SRC_ARG"; WIZ_C_SRC="zip" ;;
                *) die "$SRC_ARG is a file but not a .zip archive" "stage 3 · environment" ;;
            esac
        elif [ -d "$SRC_ARG" ] && [ -f "$SRC_ARG/package.json" ]; then
            WORK_DIR="${SRC_ARG%/}"
            wlog ok "source found in $WORK_DIR"
            WIZ_C_SRC="folder"
        else
            die "source '$SRC_ARG' is neither a Proto Panel zip nor a directory containing package.json" "stage 3 · environment"
        fi
    elif [ -f package.json ]; then
        WORK_DIR="."
        wlog ok "source found in $(pwd)"
        WIZ_C_SRC="here"
    elif [ -d Proto ] && [ -f Proto/package.json ]; then
        WORK_DIR="Proto"
        wlog ok "source found in ./Proto"
        WIZ_C_SRC="Proto"
    else
        if [ "$OPT_DRY" = "1" ]; then
            stage_dry_sandbox "git clone repository [dry-run · skipped]"
            WIZ_C_SRC="dry"
        else
            wlog info "cloning the Proto Panel repository…"
            wiz_run "git clone repository" --stream -- git clone https://github.com/JishnuTheGamer/Jtg.git Proto \
                || die "could not clone the repository (network problem? use a local .zip source)" "stage 3 · environment"
            WORK_DIR="Proto"
            WIZ_C_SRC="git"
        fi
    fi
    cd "$WORK_DIR" || die "cannot enter $WORK_DIR" "stage 3 · environment"
    log "WORK_DIR=$WORK_DIR pwd=$(pwd)"
    # read the panel version from package.json (real value, shown in the header)
    if [ -f package.json ]; then
        local pver
        pver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1)
        if [ -n "$pver" ]; then
            WIZ_PANELV="v$pver"
            wlog info "panel version $pver"
        fi
    fi
    wiz_update_chips; wiz_draw_header
    wiz_sub 600 "scaffolding service files"
    if [ "$INSTALL_MODE" = "docker" ]; then
        if [ ! -f Dockerfile ] || [ ! -f docker-compose.yml ]; then
            write_docker_files || die "could not write Dockerfile / docker-compose.yml" "stage 3 · environment"
            if [ "$OPT_DRY" = "1" ]; then
                wlog info "Dockerfile + docker-compose.yml staged [dry-run · skipped]"
            else
                wlog ok "Dockerfile + docker-compose.yml written"
            fi
        else
            wlog ok "Dockerfile + docker-compose.yml already present"
        fi
    else
        if [ ! -f ecosystem.config.cjs ]; then
            write_node_files || die "could not write ecosystem.config.cjs" "stage 3 · environment"
            if [ "$OPT_DRY" = "1" ]; then
                wlog info "ecosystem.config.cjs staged [dry-run · skipped]"
            else
                wlog ok "ecosystem.config.cjs written"
            fi
        else
            wlog ok "ecosystem.config.cjs already present"
        fi
    fi
    wiz_stage_done
}

# ---- stage 4 · data store -----------------------------------------------------
stage_data() {
    wiz_stage_begin $ST_DATA
    wiz_sub 100 "preparing data directories"
    wiz_run "create .data + backups directories" -- mkdir -p .data backups
    wiz_sub 400 "checking data store integrity"
    if [ -d .data ]; then
        local f bad=0 checked=0
        for f in .data/*.json; do
            [ -f "$f" ] || continue
            checked=$(( checked + 1 ))
            if [ -s "$f" ] && have node; then
                if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" 2>/dev/null; then
                    bad=$(( bad + 1 ))
                    wlog warn "$(basename "$f") is corrupted — backing it up before the panel replaces it"
                    log "corrupt store: $f"
                    if [ "$OPT_DRY" != "1" ]; then
                        mkdir -p .data/corrupt-backup 2>/dev/null
                        cp "$f" ".data/corrupt-backup/$(basename "$f").$(date +%s).bak" 2>/dev/null || true
                    fi
                fi
            fi
        done
        if [ $checked -gt 0 ]; then
            if [ $bad -eq 0 ]; then
                wlog ok "$checked data store file(s) checked — all valid"
            else
                wlog warn "$checked file(s) checked, $bad corrupted (backed up to .data/corrupt-backup/)"
            fi
        else
            wlog info "data directory exists, no store files yet"
        fi
    else
        wlog info "fresh install — no existing data store"
    fi
    wiz_sub 800 "checking writability"
    wiz_run "write test inside .data" -- sh -c 'touch .data/.wiz-write-test && rm -f .data/.wiz-write-test'
    if [ -f .data/.jwt-secret ]; then
        wlog ok "JWT secret persisted (.data/.jwt-secret)"
    else
        wlog info "JWT secret will be generated on first boot"
    fi
    wiz_stage_done
}

# ---- stage 5 · backend --------------------------------------------------------
stage_backend() {
    wiz_stage_begin $ST_BACKEND
    if [ "$INSTALL_MODE" = "docker" ]; then
        wiz_sub 50 "building the docker image (deps + backend + frontend)"
        local c
        c=$(get_compose_cmd)
        wiz_run "docker compose build proto-main" --stream -- $c build proto-main \
            || die "docker image build failed" "stage 5 · backend"
        wiz_sub 1000
    else
        if [ -d node_modules ] && [ -x node_modules/.bin/vite ] && [ -d node_modules/express ]; then
            wlog ok "node_modules already installed"
            wiz_sub 500
        else
            wiz_sub 50 "installing npm dependencies"
            wiz_run "npm install" --stream -- \
                npm install --no-audit --no-fund --legacy-peer-deps \
                || wiz_run "npm install (retry, forced)" --stream -- \
                npm install --no-audit --no-fund --legacy-peer-deps --force \
                || die "npm install failed" "stage 5 · backend"
            wiz_sub 550
        fi
        wiz_sub 600 "bundling the server (esbuild)"
        wiz_run "esbuild server bundle" --stream -- \
            npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs \
            || die "server bundle failed" "stage 5 · backend"
        if [ "$OPT_DRY" != "1" ] && [ ! -f dist/server.cjs ]; then
            die "dist/server.cjs missing after the backend build" "stage 5 · backend"
        fi
        wiz_sub 1000
    fi
    wiz_stage_done
}

# ---- stage 6 · frontend build -------------------------------------------------
stage_frontend() {
    wiz_stage_begin $ST_FRONT
    if [ "$INSTALL_MODE" = "docker" ]; then
        wiz_stage_skip "the frontend is bundled inside the Docker image (stage 5)"
        return 0
    fi
    if [ -f dist/index.html ]; then
        wlog ok "dist/ frontend already built"
        wiz_sub 1000
    else
        wiz_sub 100 "building the web app (vite)"
        # --emptyOutDir=false keeps dist/server.cjs from stage 5; if this vite
        # version rejects the flag, fall back to the stock full build.
        wiz_run "vite build (keep server bundle)" --stream -- \
            npx vite build --emptyOutDir=false \
            || wiz_run "npm run build (full bundle)" --stream -- \
            env NODE_OPTIONS=--max-old-space-size=2048 npm run build \
            || die "frontend build failed" "stage 6 · frontend build"
        wiz_sub 900
    fi
    if [ "$OPT_DRY" != "1" ]; then
        if [ ! -f dist/index.html ]; then
            die "dist/index.html missing after the frontend build" "stage 6 · frontend build"
        fi
        wlog ok "frontend artifacts present (dist/index.html)"
    fi
    wiz_sub 1000
    wiz_stage_done
}

# ---- stage 7 · services -------------------------------------------------------
run_pm2() {
    if have pm2; then pm2 "$@"
    elif [ -x /usr/local/bin/pm2 ]; then /usr/local/bin/pm2 "$@"
    elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 "$@"
    else return 1
    fi
}

stage_services() {
    wiz_stage_begin $ST_SVC
    if [ "$INSTALL_MODE" = "docker" ]; then
        local d c st tries
        d=$(get_docker_cmd)
        c=$(get_compose_cmd)
        wiz_sub 100 "removing any old container"
        if [ "$OPT_DRY" != "1" ]; then
            $d rm -f proto-main >> "$LOG" 2>&1 || true
        fi
        export PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS"
        wiz_sub 300 "starting the container"
        wiz_run "docker compose up -d proto-main" --stream -- $c up -d proto-main \
            || die "docker compose failed to start the panel" "stage 7 · services"
        if [ "$OPT_DRY" = "1" ]; then
            wlog info "dry-run: container proto-main assumed running"
            wiz_sub 1000
        else
            tries=0
            st="not_found"
            while [ $tries -lt 20 ]; do
                st=$($d inspect --format '{{.State.Status}}' proto-main 2>/dev/null || echo "not_found")
                [ "$st" = "running" ] && break
                if [ "$st" = "exited" ] || [ "$st" = "dead" ]; then
                    $d logs proto-main --tail 40 >> "$LOG" 2>&1 || true
                    die "container proto-main entered state '$st'" "stage 7 · services"
                fi
                wiz_sub $(( 300 + tries * 30 )) "waiting for container ($(( tries + 1 ))/20)"
                sleep 1.5
                tries=$(( tries + 1 ))
            done
            if [ "$st" = "running" ]; then
                wlog ok "container proto-main is running"
            else
                die "container never reached the running state" "stage 7 · services"
            fi
            wiz_sub 1000
        fi
    else
        # node + pm2
        wiz_sub 100 "checking pm2"
        if ! have pm2 && [ ! -x ./node_modules/.bin/pm2 ] && [ ! -x /usr/local/bin/pm2 ]; then
            wiz_run "installing pm2" --stream -- npm install -g pm2 --no-audit --no-fund \
                || wiz_run "installing pm2 (local)" -- npm install --no-save pm2 --no-audit --no-fund \
                || die "pm2 installation failed" "stage 7 · services"
        else
            wlog ok "pm2 available"
        fi
        export PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS"
        wiz_sub 300 "restarting the panel process"
        if [ "$OPT_DRY" != "1" ]; then
            run_pm2 delete proto-main >/dev/null 2>&1 || true
            run_pm2 delete proto-panel >/dev/null 2>&1 || true
        fi
        wiz_run "pm2 start proto-main" --stream -- bash -c 'if command -v pm2 >/dev/null 2>&1; then pm2 start ecosystem.config.cjs --only proto-main && pm2 save --force; elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 start ecosystem.config.cjs --only proto-main && ./node_modules/.bin/pm2 save --force; else npm start; fi' \
            || die "pm2 failed to start the panel" "stage 7 · services"
        if [ "$OPT_DRY" = "1" ]; then
            wlog info "dry-run: process proto-main assumed online"
            wiz_sub 1000
        else
            wiz_sub 700 "waiting for the process"
            local tries=0 pid
            if run_pm2 pid proto-main >/dev/null 2>&1; then
                while [ $tries -lt 15 ]; do
                    pid=$(run_pm2 pid proto-main 2>/dev/null | tail -1)
                    case "$pid" in
                        ''|*[!0-9]*|0) ;;
                        *) break ;;
                    esac
                    wiz_sub $(( 700 + tries * 15 )) "waiting for pm2 ($(( tries + 1 ))/15)"
                    sleep 1
                    tries=$(( tries + 1 ))
                done
                wlog ok "pm2 process proto-main online (pid $(run_pm2 pid proto-main 2>/dev/null | tail -1))"
            else
                wlog info "pm2 not managing the process (npm start fallback) — the health check will verify"
            fi
            wiz_sub 1000
        fi
    fi
    wiz_stage_done
}

# ---- stage 8 · final verification (health + REAL login test) ------------------
ensure_owner() {
    wlog info "ensuring the owner account '$OWNER_USER' exists"
    if [ "$INSTALL_MODE" = "docker" ]; then
        local d
        d=$(get_docker_cmd)
        wiz_run "create owner (docker exec)" --mask -- $d exec \
            -e PROTO_OWNER_USER="$OWNER_USER" -e PROTO_OWNER_PASS="$OWNER_PASS" \
            proto-main npm run createuser \
          || wiz_run "create owner (host fallback)" --mask -- \
            env PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS" npm run createuser \
          || wlog warn "owner bootstrap returned non-zero — relying on the boot-time env account"
    else
        wiz_run "create owner (npm run createuser)" --mask -- \
            env PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS" npm run createuser \
          || wlog warn "owner bootstrap returned non-zero — relying on the boot-time env account"
    fi
}

stage_verify() {
    wiz_stage_begin $ST_VERIFY
    local port="$PANEL_PORT" tries=0 max=30 hjson st ver
    if [ "$OPT_DRY" = "1" ]; then
        wlog info "dry-run: final verification skipped"
        wiz_sub 1000
        wiz_stage_done
        return 0
    fi
    wiz_label "waiting for /api/health"
    st=""
    while [ $tries -lt $max ]; do
        hjson=$(curl -s -m 4 "http://127.0.0.1:$port/api/health" 2>/dev/null)
        st=$(printf '%s' "$hjson" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
        if [ "$st" = "ok" ]; then break; fi
        wiz_sub $(( tries * 400 / max )) "health check ($(( tries + 1 ))/$max)"
        sleep 1.2
        tries=$(( tries + 1 ))
    done
    if [ "$st" != "ok" ]; then
        die "the panel did not become healthy on :$port within ~$(( max * 12 / 10 ))s" "stage 8 · final verification"
    fi
    ver=$(printf '%s' "$hjson" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
    VERIFY_VERSION="${ver:-unknown}"
    wlog ok "panel v$VERIFY_VERSION answers on http://127.0.0.1:$port"
    wiz_sub 450 "verifying the owner account"
    ensure_owner
    wiz_sub 650 "verifying real login (POST /api/auth/login)"
    if [ "$OWNER_PROVIDED" = "1" ]; then
        local ej login
        ej=$(printf '%s' "$OWNER_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')
        login=$(curl -s -m 8 -X POST -H 'Content-Type: application/json' \
            -d "{\"username\":\"$OWNER_USER\",\"password\":\"$ej\"}" \
            "http://127.0.0.1:$port/api/auth/login" 2>/dev/null)
        case "$login" in
            *'"token"'*)
                VERIFY_LOGIN=1
                wlog ok "owner login verified — a real JWT was issued"
                ;;
            *)
                wlog err "login test response: $(printf '%s' "$login" | head -c 160)"
                die "owner login could not be verified on the running panel" "stage 8 · final verification"
                ;;
        esac
    else
        wlog info "login test skipped (password was generated — the panel is healthy)"
    fi
    wiz_sub 900 "reading live service status"
    if [ "$INSTALL_MODE" = "docker" ]; then
        local d
        d=$(get_docker_cmd)
        VERIFY_SVC="docker: $($d inspect --format '{{.State.Status}} · restart {{.HostConfig.RestartPolicy.Name}}' proto-main 2>/dev/null || echo 'unknown')"
    else
        local p
        if run_pm2 pid proto-main >/dev/null 2>&1; then
            p=$(run_pm2 pid proto-main 2>/dev/null | tail -1)
            case "$p" in
                ''|*[!0-9]*|0) VERIFY_SVC="pm2: proto-main (starting)" ;;
                *) VERIFY_SVC="pm2: online (pid $p)" ;;
            esac
        else
            VERIFY_SVC="node: npm start (no pm2)"
        fi
    fi
    wlog ok "service status: $VERIFY_SVC"
    wiz_sub 1000
    wiz_stage_done
}

# ---- stage 9 · complete -------------------------------------------------------
wiz_success() {  # TITLE
    local title="${1:-INSTALLATION COMPLETE}"
    local el=$(( $(date +%s) - START_TS ))
    local mm=$(( el / 60 )) ss=$(( el % 60 ))
    local url="http://$SYS_IP:$PANEL_PORT"
    wiz_leave
    cls
    build_logo "PROTO" "PANEL"
    show_logo
    printf '\n'
    if [ "$OPT_DRY" = "1" ]; then
        glow_box "DRY-RUN COMPLETE — NOTHING WAS INSTALLED" \
            "  $ICO_SPARK Pipeline   all 9 stages rehearsed successfully" \
            "  $ICO_SPARK Changed    nothing (dry-run mode)" \
            "  $ICO_SPARK Next       bash proto-install.sh    (real install)" \
            "  $ICO_SPARK Elapsed    ${mm}m ${ss}s" \
            "  $ICO_SPARK Log        $LOG"
    else
        local login_line="not tested (generated password)"
        [ "$VERIFY_LOGIN" = "1" ] && login_line="verified ✓ (JWT issued)"
        glow_box "$title" \
            "  $ICO_SPARK Panel      $url" \
            "  $ICO_SPARK Version    $VERIFY_VERSION (live from /api/health)" \
            "  $ICO_SPARK Mode       $INSTALL_MODE" \
            "  $ICO_SPARK Service    $VERIFY_SVC" \
            "  $ICO_SPARK Health     OK (/api/health)" \
            "  $ICO_SPARK Login      $login_line" \
            "  $ICO_SPARK Username   $OWNER_USER" \
            "  $ICO_SPARK Password   $OWNER_PASS_SHOW" \
            "  $ICO_SPARK Elapsed    ${mm}m ${ss}s" \
            "  $ICO_SPARK Log        $LOG"
    fi
    printf '\n'
    printf '  %s ' "$DIM"
    grad_print "NEXT STEPS" 140 160 200 140 160 200
    printf '%s\n' "$RESET"
    printf '   %s %s\n' "$ICO_ARROW" "open $url in your browser and log in"
    printf '   %s %s\n' "$ICO_ARROW" "manage the panel any time:  bash proto-install.sh"
    printf '   %s %s\n' "$ICO_ARROW" "troubleshooting:             less $LOG"
    printf '\n'
    confetti
    printf '  '
    grad_print "$PANEL_NAME · $INSTALLER_NAME v$INSTALLER_VER" 140 160 200 90 130 200
    printf '\n\n'
}

stage_complete() {
    wiz_stage_begin $ST_DONE
    WIZ_SUB=1000
    if [ "$WIZ_FULL" = "1" ]; then
        wiz_draw_stages
        wiz_draw_bar
        wiz_draw_status
        wiz_draw_footer
    fi
    wlog ok "all stages complete"
    wiz_stage_done
    if [ "$OPT_UPDATE" = "1" ]; then
        wiz_success "UPDATE COMPLETE"
    else
        wiz_success "INSTALLATION COMPLETE"
    fi
}

# ============================================================================
#  SECTION 8 · DEMO MODE (FX showcase — installs nothing)
# ============================================================================

# wizard_preview — animates the wizard shell with DEMO data (clearly labelled)
wizard_preview() {
    if wiz_can_full; then
        wiz_init_state
        wiz_layout
        WIZ_FULL=1
        cur_hide
        printf '\033[?1049h\033[H\033[2J'
        WIZ_NET="online"; WIZ_ROOT="root"; WIZ_DOCKER="yes"
        WIZ_NODE="v22.13.1"; WIZ_MODE="docker"; WIZ_PANELV="v3.2.0"
        wiz_update_chips
        wiz_redraw
        local i f
        for i in 0 1 2 3 4 5 6 7; do
            WIZ_STAGE_IDX=$i
            WIZ_STATE[$i]="active"
            for f in 1 2 3 4 5 6 7 8; do
                WIZ_SUB=$(( f * 125 ))
                WIZ_SPIN_FR=$(( WIZ_SPIN_FR + 1 ))
                WIZ_STAT_LABEL="demo — nothing is being installed"
                wiz_ring_push "out" "demo frame: stage $(( i + 1 )) · ${WIZ_STAGES[$i]} · ${f}00/1000"
                wiz_draw_stages; wiz_draw_bar; wiz_draw_status; wiz_draw_logs; wiz_draw_footer
                sleep 0.07
            done
            WIZ_STATE[$i]="done"
            WIZ_DUR[$i]=$(( i + 1 ))
            wiz_draw_stages
        done
        WIZ_STAGE_IDX=8
        WIZ_STATE[8]="done"
        wiz_redraw
        sleep 0.9
        wiz_leave
        printf '  %s\n\n' "${DIM}(that was the wizard shell preview — run --dry-run for a real rehearsal)$RESET"
        WIZ_STAGE_IDX=-1
        wiz_init_state
    else
        printf '  (the full-screen wizard needs an interactive terminal of 27+ lines)\n\n'
    fi
}

demo() {
    cls
    build_logo "PROTO" "PANEL"
    show_logo
    printf '\n'
    center_print "PRISM WIZARD · FX SHOWCASE"
    scan_sweep 2

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} installation wizard preview ${LN_D}${LN_D}${RESET}"
    wizard_preview

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} gradient text ${LN_D}${LN_D}${RESET}"
    printf '  '; grad_print "cool blue to violet gradient" 90 150 255 170 90 255; printf '\n'
    printf '  '; grad_print "sunset amber to crimson" 255 200 90 255 80 90; printf '\n'
    printf '  '; grad_print "emerald to teal" 80 250 123 40 200 190; printf '\n\n'

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} rainbow cycle ${LN_D}${LN_D}${RESET}"
    local f
    if [ "$FX" = "1" ]; then
        for f in 0 800 1600 2400 3200; do
            printf '\r'
            rainbow_print "every color of the panel spectrum" "$f" 60
            sleep 0.25
        done
        printf '\r'; rainbow_print "every color of the panel spectrum" 4000 60; printf '\n'
    else
        printf '  '; rainbow_print "every color of the panel spectrum" 0 60; printf '\n'
    fi
    printf '\n'

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} typewriter ${LN_D}${LN_D}${RESET}"
    printf '  '; typew "typing effect with gradient and blinking caret" 235 240 255 150 200 255 18

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} progress bar ${LN_D}${LN_D}${RESET}"
    local p
    if [ "$FX" = "1" ]; then
        for p in 0 4 12 22 35 48 62 75 86 93 100; do
            draw_bar "$p" "installing pure eye-candy" $(( p / 3 ))
            sleep 0.12
        done
        printf '\n'
    else
        printf '  [####################] 100%% done\n'
    fi
    printf '\n'

    printf '  '; printf '%s\n' "${DIM}${LN_D}${LN_D} spinner / pulse / matrix ${LN_D}${LN_D}${RESET}"
    if [ "$FX" = "1" ]; then
        sleep 1.4 &
        local fakepid=$!
        fx_spin_loop "$fakepid" "spinner while a command runs"
        wait "$fakepid" 2>/dev/null
        sleep 1.2 &
        fakepid=$!
        fx_pulse_loop "$fakepid" "pulse while waiting"
        wait "$fakepid" 2>/dev/null
        sleep 1.6 &
        fakepid=$!
        fx_matrix_loop "$fakepid" "matrix rain while building"
        wait "$fakepid" 2>/dev/null
        printf '\n'
    else
        printf '  (spinners, pulse and matrix rain need an interactive terminal)\n\n'
    fi

    glow_box "DEMO COMPLETE" \
        "  this was only a taste of the installer fx" \
        "  run: bash proto-install.sh          (real install)" \
        "  run: bash proto-install.sh --dry-run (full rehearsal)"

    printf '\n'
    confetti
    QUIET_EXIT=1
    exit 0
}

# ============================================================================
#  SECTION 9 · UPDATE FLOW (same wizard, update semantics)
# ============================================================================

update_flow() {
    stage_sysreq
    stage_deps
    wiz_stage_begin $ST_ENV
    wiz_sub 100 "updating panel source"
    if [ -d .git ]; then
        wiz_run "git pull latest changes" --stream -- git pull \
            || die "git pull failed" "update · source"
    else
        wlog info "not a git checkout — keeping the current source"
    fi
    if [ -f package.json ]; then
        local pver
        pver=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1)
        [ -n "$pver" ] && WIZ_PANELV="v$pver"
        wiz_update_chips; wiz_draw_header
    fi
    wiz_sub 700 "checking service files"
    if [ "$INSTALL_MODE" = "docker" ]; then
        write_docker_files || true
    else
        [ -f ecosystem.config.cjs ] || write_node_files || true
    fi
    wiz_stage_done
    wiz_stage_begin $ST_DATA
    wiz_stage_skip "the data store is preserved during updates"
    stage_backend
    stage_frontend
    wiz_stage_begin $ST_SVC
    if [ "$INSTALL_MODE" = "docker" ]; then
        local c
        c=$(get_compose_cmd)
        wiz_sub 300 "rebuilding + restarting the container"
        wiz_run "docker compose up -d --build proto-main" --stream -- $c up -d --build proto-main \
            || die "docker compose failed" "update · services"
        wiz_sub 1000
    else
        wiz_sub 300 "restarting pm2 process"
        wiz_run "pm2 restart proto-main" --stream -- bash -c 'if command -v pm2 >/dev/null 2>&1; then pm2 restart proto-main || pm2 start ecosystem.config.cjs --only proto-main; elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 restart proto-main || ./node_modules/.bin/pm2 start ecosystem.config.cjs --only proto-main; fi' \
            || die "pm2 restart failed" "update · services"
        wiz_sub 1000
    fi
    wiz_stage_done
    stage_verify
    if [ "$OWNER_PROVIDED" != "1" ]; then
        OWNER_PASS_SHOW="(unchanged)"
    fi
    stage_complete
}

# ============================================================================
#  SECTION 10 · ARGUMENTS · USAGE · MAIN
# ============================================================================

usage() {
    setup_term
    printf '\n'
    grad_print "  $PANEL_NAME — $INSTALLER_NAME v$INSTALLER_VER" 120 160 255 190 110 255
    printf '\n\n'
    printf '  %s\n' "Full-screen, OS-install-style wizard for $PANEL_NAME."
    printf '  9 real stages · live streamed logs · progress that never lies.\n'
    printf '\n  %s\n' "$(printf '%s' "$BOLD")USAGE$RESET"
    printf '   %s\n' "bash proto-install.sh [options] [SOURCE]"
    printf '   %s\n' "SOURCE can be a Proto Panel .zip archive or an extracted folder"
    printf '\n  %s\n' "$(printf '%s' "$BOLD")OPTIONS$RESET"
    printf '   %-26s %s\n' "--demo"          "showcase all animations, install nothing"
    printf '   %-26s %s\n' "--dry-run"       "rehearse the full pipeline, change nothing"
    printf '   %-26s %s\n' "--mode=docker|node" "force deployment mode (default: auto)"
    printf '   %-26s %s\n' "--owner=NAME"    "owner username (default: admin)"
    printf '   %-26s %s\n' "--password=PASS" "owner password (default: generated)"
    printf '   %-26s %s\n' "--port=N"        "panel port for health check (default: $DEFAULT_PORT)"
    printf '   %-26s %s\n' "--update"        "update an existing installation"
    printf '   %-26s %s\n' "--no-wizard"     "plain flowing output (CI / small terminals)"
    printf '   %-26s %s\n' "--fast"          "halve animation times (slow terminals)"
    printf '   %-26s %s\n' "--no-color"      "disable colors and animations"
    printf '   %-26s %s\n' "--truecolor"     "force 24-bit color"
    printf '   %-26s %s\n' "--256"           "force 256-color mode"
    printf '   %-26s %s\n' "-h, --help"      "this help"
    printf '\n  %s\n' "$(printf '%s' "$BOLD")STAGES$RESET"
    printf '   %s\n' "1 system requirements → 2 dependencies → 3 environment →"
    printf '   %s\n' "4 data store → 5 backend → 6 frontend build → 7 services →"
    printf '   %s\n' "8 final verification (health + real login test) → 9 complete"
    printf '\n  %s\n' "$(printf '%s' "$BOLD")EXAMPLES$RESET"
    printf '   %s\n' "bash proto-install.sh                     # automatic docker install (git clone)"
    printf '   %s\n' "bash proto-install.sh Proto-Panel.zip     # install from a local zip archive"
    printf '   %s\n' "bash proto-install.sh --mode=node         # node + pm2 install"
    printf '   %s\n' "bash proto-install.sh --owner=boss --password=S3cret"
    printf '\n'
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --demo)          OPT_DEMO=1 ;;
            --dry-run)       OPT_DRY=1 ;;
            --update)        OPT_UPDATE=1 ;;
            --fast)          OPT_FAST=1 ;;
            --no-wizard)     OPT_WIZARD=0 ;;
            --no-color)      OPT_COLOR="0" ;;
            --truecolor)     OPT_COLOR="24" ;;
            --256)           OPT_COLOR="256" ;;
            --mode=*)        OPT_MODE="${1#--mode=}" ;;
            --owner=*)       OPT_OWNER="${1#--owner=}" ;;
            --password=*)    OPT_PASS="${1#--password=}" ;;
            --port=*)        OPT_PORT="${1#--port=}" ;;
            -h|--help)       usage; QUIET_EXIT=1; exit 0 ;;
            --version)       echo "proto-install ($INSTALLER_NAME) $INSTALLER_VER"; QUIET_EXIT=1; exit 0 ;;
            -*)              printf 'unknown option: %s (try --help)\n' "$1" >&2; QUIET_EXIT=1; exit 2 ;;
            *)               if [ -z "$SRC_ARG" ]; then
                                 SRC_ARG="$1"
                             else
                                 printf 'unexpected extra argument: %s (try --help)\n' "$1" >&2; QUIET_EXIT=1; exit 2
                             fi ;;
        esac
        shift
    done
}

main() {
    parse_args "$@"
    setup_term

    # absolute log path — stages cd into the source directory, so a relative
    # log path would silently split across two files (fixed in v2.0.0)
    LOG="$(pwd)/$LOG_FILE"
    [ -n "$PROTO_INSTALL_LOG" ] && LOG="$PROTO_INSTALL_LOG"
    : > "$LOG" 2>/dev/null || LOG="/tmp/proto-install.log"
    hr_log
    log "$PANEL_NAME installer v$INSTALLER_VER started (pid $$)"
    log "args: demo=$OPT_DEMO dry=$OPT_DRY update=$OPT_UPDATE mode=$OPT_MODE color=$COLOR_MODE fx=$FX width=$W wizard=$OPT_WIZARD"

    trap cleanup EXIT
    trap on_int INT TERM

    PANEL_PORT="$OPT_PORT"
    [ -z "$PANEL_PORT" ] && PANEL_PORT="${PROTO_PORT:-$DEFAULT_PORT}"
    OWNER_USER="$OPT_OWNER"
    [ -z "$OWNER_USER" ] && OWNER_USER="${PROTO_OWNER_USER:-admin}"
    OWNER_PASS="$OPT_PASS"
    [ -z "$OWNER_PASS" ] && OWNER_PASS="${PROTO_OWNER_PASS:-}"
    OWNER_PROVIDED=0
    [ -n "$OPT_PASS" ] && OWNER_PROVIDED=1
    [ -n "$OWNER_PASS" ] && OWNER_PROVIDED=1
    [ -z "$OWNER_PASS" ] && OWNER_PASS="$(gen_pass)"
    OWNER_PASS_SHOW="$OWNER_PASS"
    START_TS=$(date +%s)

    [ "$OPT_DEMO" = "1" ] && demo

    # ---- boot the wizard ----------------------------------------------------
    WIZ_T0=$(date +%s)
    wiz_init_state
    wiz_update_chips
    wiz_enter
    wlog info "$PANEL_NAME · $INSTALLER_NAME v$INSTALLER_VER started"
    if [ "$OPT_DRY" = "1" ]; then
        wlog info "DRY-RUN mode — no changes will be made"
    fi

    if [ "$OPT_UPDATE" = "1" ]; then
        update_flow
    else
        stage_sysreq
        stage_deps
        stage_env
        stage_data
        stage_backend
        stage_frontend
        stage_services
        stage_verify
    fi
    stage_complete

    QUIET_EXIT=1
    log "completed successfully in $(( $(date +%s) - START_TS ))s"
    exit 0
}

main "$@"
