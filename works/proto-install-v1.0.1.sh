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
#      P A N E L   ·   PRISM AUTOMATIC INSTALLER v1.0.0
#
#   Fully automatic, maximum-animation installer for Proto Panel.
#   Truecolor gradients · rainbow logo waves · matrix rain · confetti.
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

INSTALLER_NAME="Prism"
INSTALLER_VER="1.0.1"
PANEL_NAME="Proto Panel"
PANEL_TAGLINE="The next-generation game server panel"
DEFAULT_PORT=6767
DRY_SANDBOX=""

# --- option defaults ---------------------------------------------------------
OPT_DEMO=0; OPT_DRY=0; OPT_UPDATE=0; OPT_FAST=0
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
    else
        SPIN=( "|" "/" "-" "\\" )
        ICO_OK="[OK]"; ICO_FAIL="[!!]"; ICO_WARN="[!]"; ICO_INFO="[i]"
        ICO_ARROW="->"; ICO_DOT="*"; ICO_SPARK="*"
        BLK_F="#"; BLK_E="."; LN_D="-"; LN_B="="
        B_TL="+"; B_TR="+"; B_BL="+"; B_BR="+"; B_V="|"; B_H="-"; B_ML="+"; B_MR="+"
        CONF_SYMS=( "*" "+" "o" "x" "@" "." )
        PULSE_F=( "  *  " " .*. " "..*.." ". * ." "  *  " )
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
GLYPH_N=( "███╗   ██╗" "████╗  ██║" "██╔██╗ ██║" "██║╚██╗██║" "██║ ╚████║" "╚═╝  ╚═══╝" )
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
#  SECTION 4 · BARS · SPINNERS · MATRIX · CONFETTI · BOXES
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
#   Runs cmd in background, plays the chosen animation, reports result.
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

# like run_fx but shows the command output live (for sudo-needing installs)
run_fx_live() {
    local label="$1"; shift
    log "RUN(live): $*"
    if [ "$OPT_DRY" = "1" ]; then
        printf '  '; fg_info; printf '%s [dry-run · skipped]\n' "$ICO_INFO"; printf '%s' "$RESET"
        return 0
    fi
    printf '  '; fg_warn; printf '%s' "$ICO_WARN"; printf '%s' "$RESET"
    printf ' %s (password may be asked)\n' "$label"
    if "$@" 2>&1 | tee -a "$LOG"; then
        printf '  '; fg_ok; printf '%s %s\n' "$ICO_OK" "$label"; printf '%s' "$RESET"
        return 0
    fi
    printf '  '; fg_fail; printf '%s %s [FAILED]\n' "$ICO_FAIL" "$label"; printf '%s' "$RESET"
    return 1
}

die() {
    local msg="$1" phase="${2:-install}"
    DIE_DONE=1
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
    printf '  %s' "$DIM"
    printf 'phase: %s · see %s for full details\n' "$phase" "$LOG"
    printf '%s' "$RESET"
    if [ -s "$LOG" ]; then
        printf '\n  %s\n' "${DIM}--- last log lines ---${RESET}"
        tail -n 10 "$LOG" 2>/dev/null | sed 's/^/  /'
    fi
    printf '\n'
    exit 1
}

cleanup() {
    local rc=$?
    [ -n "$BG_PID" ] && kill "$BG_PID" 2>/dev/null
    if [ -n "${DRY_SANDBOX:-}" ] && [ -d "$DRY_SANDBOX" ]; then
        rm -rf "$DRY_SANDBOX" 2>/dev/null
    fi
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
#  SECTION 7 · ANIMATED PHASES
# ============================================================================

PHASE_N=0
PHASE_T=0

phase() { # phase "TITLE" — gradient banner with typewriter title
    PHASE_N=$(( PHASE_N + 1 ))
    printf '\n'
    scan_sweep 1
    printf '  '
    grad_print "PHASE $PHASE_N" 90 130 255 180 100 255
    fg 120 130 150
    printf ' %s·%s ' "$FG_OUT" "$RESET"
    typew "$1" 235 240 255 150 200 255 12
    scan_sweep 1
}

phase_scan() {
    phase "SYSTEM SCAN"
    local os arch kernel cpu mem disk ip
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
    ip=$(get_sys_ip)
    SYS_IP="$ip"

    scan_row "OS"       "$os"
    scan_row "ARCH"     "$arch"
    scan_row "KERNEL"   "$kernel"
    scan_row "CPU"      "$cpu cores"
    scan_row "MEMORY"   "$mem"
    scan_row "DISK"     "$disk"
    scan_row "NETWORK"  "$ip"
    log "SYS: $os $arch kernel=$kernel cpu=$cpu mem=$mem disk=$disk ip=$ip"
}

scan_row() { # scan_row LABEL VALUE [ok|warn|fail]
    local l="$1" v="$2" st="${3:-ok}" i
    printf '  %s' "$DIM"
    fg 100 115 140
    printf '%-10s%s' "$l" "$RESET"
    if [ "$FX" = "1" ]; then
        for (( i = 0; i < 3; i++ )); do printf '.'; sleep 0.05; done
    else
        printf '...'
    fi
    printf ' '
    case "$st" in
        ok)   fg_ok ;;
        warn) fg_warn ;;
        fail) fg_fail ;;
    esac
    printf '%s%s\n' "$BOLD$FG_OUT" "$v$RESET"
}

phase_preflight() {
    phase "PREFLIGHT CHECKS"
    local need=""
    for c in curl git tar; do have "$c" || need="$need $c"; done

    if [ -n "$need" ]; then
        local mgr; mgr=$(pkg_mgr)
        if [ "$mgr" = "none" ]; then
            die "missing required tools:$need — install them manually and retry" "preflight"
        fi
        if sudo_nonint || [ "$(id -u)" = "0" ]; then
            case "$mgr" in
                apt)    run_fx "installing$need via apt"     matrix -- run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q $need ca-certificates ;;
                dnf)    run_fx "installing$need via dnf"     matrix -- run_root dnf install -y -q $need ;;
                yum)    run_fx "installing$need via yum"     matrix -- run_root yum install -y -q $need ;;
                pacman) run_fx "installing$need via pacman"  matrix -- run_root pacman -S --noconfirm --needed $need ;;
                zypper) run_fx "installing$need via zypper"  matrix -- run_root zypper -n in $need ;;
                apk)    run_fx "installing$need via apk"    matrix -- run_root apk add --no-cache $need ;;
            esac || die "could not install required tools:$need" "preflight"
        else
            # sudo may ask for a password — run visible in the foreground
            case "$mgr" in
                apt)    run_fx_live "installing$need via apt" run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q $need ca-certificates ;;
                dnf)    run_fx_live "installing$need via dnf" run_root dnf install -y -q $need ;;
                yum)    run_fx_live "installing$need via yum" run_root yum install -y -q $need ;;
                pacman) run_fx_live "installing$need via pacman" run_root pacman -S --noconfirm --needed $need ;;
                zypper) run_fx_live "installing$need via zypper" run_root zypper -n in $need ;;
                apk)    run_fx_live "installing$need via apk"    run_root apk add --no-cache $need ;;
            esac || die "could not install required tools:$need" "preflight"
        fi
    else
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "curl, git, tar present"
    fi

    # swap guard for low-memory boxes (silent, logged)
    local tm ts
    tm=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')
    ts=$(free -m 2>/dev/null | awk '/^Swap:/{print $2}')
    if [ -n "$tm" ] && [ "$tm" -lt 2000 ] && { [ -z "$ts" ] || [ "$ts" -lt 512 ]; }; then
        log "low memory (${tm}MB, swap ${ts:-0}MB) — attempting swapfile"
        if [ "$OPT_DRY" != "1" ] && have fallocate && sudo_nonint; then
            if [ ! -f /swapfile ]; then
                run_root fallocate -l 2G /swapfile >> "$LOG" 2>&1
                run_root chmod 600 /swapfile >> "$LOG" 2>&1
                run_root mkswap /swapfile >> "$LOG" 2>&1
            fi
            run_root swapon /swapfile >> "$LOG" 2>&1 || true
        fi
    fi
}

phase_source() {
    phase "LOCATING PANEL SOURCE"
    if [ -n "$SRC_ARG" ]; then
        # an explicit source was given: a .zip archive or a directory
        if [ "$OPT_DRY" = "1" ]; then
            stage_dry_sandbox "source '$SRC_ARG' unpack [dry-run · skipped]"
        elif [ -f "$SRC_ARG" ]; then
            case "$SRC_ARG" in
                *.zip|*.ZIP) unpack_zip_source "$SRC_ARG" ;;
                *) die "$SRC_ARG is a file but not a .zip archive" "source" ;;
            esac
        elif [ -d "$SRC_ARG" ] && [ -f "$SRC_ARG/package.json" ]; then
            WORK_DIR="${SRC_ARG%/}"
            printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
            printf ' %s\n' "source found in $WORK_DIR"
        else
            die "source '$SRC_ARG' is neither a Proto Panel zip nor a directory containing package.json" "source"
        fi
    elif [ -f package.json ]; then
        WORK_DIR="."
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "source found in $(pwd)"
    elif [ -d Proto ] && [ -f Proto/package.json ]; then
        WORK_DIR="Proto"
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "source found in ./Proto"
    else
        if [ "$OPT_DRY" = "1" ]; then
            stage_dry_sandbox "git clone repository [dry-run · skipped]"
        else
            printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
            printf ' %s\n' "cloning Proto Panel repository..."
            run_fx "git clone repository" bar -- git clone https://github.com/JishnuTheGamer/Jtg.git Proto \
                || die "could not clone the repository (network problem?)" "source"
            WORK_DIR="Proto"
        fi
    fi
    cd "$WORK_DIR" || die "cannot enter $WORK_DIR" "source"
    log "WORK_DIR=$WORK_DIR pwd=$(pwd)"
}

# stage_dry_sandbox "message" — throwaway rehearsal directory (removed on exit)
stage_dry_sandbox() {
    DRY_SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/proto-dry.XXXXXX") \
        || die "could not create a dry-run sandbox" "source"
    WORK_DIR="$DRY_SANDBOX"
    printf '%s\n' '{ "name": "proto-panel", "version": "0.0.0-dryrun", "private": true }' \
        > "$DRY_SANDBOX/package.json"
    printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
    printf ' %s\n' "dry-run: staging throwaway sandbox (no download, no changes)"
    log "DRY-RUN: sandbox $DRY_SANDBOX ($1)"
}

# unpack_zip_source ZIP — extract a Proto Panel zip and set WORK_DIR
unpack_zip_source() {
    local zip="$1" dest cand
    have unzip || die "unzip is required to install from a zip archive (install it, or run me inside the extracted folder)" "source"
    if [ -d Proto ] && [ -f Proto/package.json ]; then
        dest="Proto-src"
    else
        dest="Proto"
    fi
    rm -rf "$dest"
    run_fx "unpacking $(basename "$zip")" bar -- unzip -q "$zip" -d "$dest" \
        || { rm -rf "$dest"; die "could not unpack $zip" "source"; }
    if [ -f "$dest/package.json" ]; then
        WORK_DIR="$dest"
    else
        for cand in "$dest"/*/; do
            if [ -f "${cand}package.json" ]; then WORK_DIR="${cand%/}"; break; fi
        done
    fi
    [ -n "${WORK_DIR:-}" ] && [ -f "$WORK_DIR/package.json" ] \
        || { rm -rf "$dest"; die "no package.json found inside $zip" "source"; }
    printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
    printf ' %s\n' "source unpacked to ./$WORK_DIR"
}

install_node_fx() {
    local need=0 vmaj
    if ! have node; then
        need=1
    else
        vmaj=$(node -v 2>/dev/null | tr -d 'v' | cut -d. -f1)
        case "$vmaj" in ''|*[!0-9]*) need=1 ;; *) [ "$vmaj" -lt 20 ] && need=1 ;; esac
    fi
    if [ "$need" = "1" ]; then
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
            printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
            printf ' %s\n' "node.js 22 ($narch) install [dry-run · skipped]"
            log "dry-run: node.js 22 install skipped (node present: $(have node && echo yes || echo no))"
            return 0
        fi
        run_fx "installing node.js 22 ($narch)" bar -- bash -c \
            "curl -fsSL https://nodejs.org/dist/v22.13.1/$dist.tar.xz -o /tmp/node22.tar.xz && tar -xJf /tmp/node22.tar.xz -C /usr/local --strip-components=1 && rm -f /tmp/node22.tar.xz" \
            || return 1
    fi
    have node || return 1
    have npm  || return 1
    return 0
}

phase_env() {
    phase "SCAFFOLDING ENVIRONMENT"
    if [ "$INSTALL_MODE" = "docker" ]; then
        if [ ! -f Dockerfile ] || [ ! -f docker-compose.yml ]; then
            write_docker_files || die "could not write Dockerfile / docker-compose.yml" "scaffold"
            printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
            if [ "$OPT_DRY" = "1" ]; then
                printf ' %s\n' "Dockerfile + docker-compose.yml staged [dry-run · skipped]"
            else
                printf ' %s\n' "Dockerfile + docker-compose.yml written"
            fi
        else
            printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
            printf ' %s\n' "Dockerfile + docker-compose.yml already present"
        fi
    else
        if [ ! -f ecosystem.config.cjs ]; then
            write_node_files || die "could not write ecosystem.config.cjs" "scaffold"
            printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
            if [ "$OPT_DRY" = "1" ]; then
                printf ' %s\n' "ecosystem.config.cjs staged [dry-run · skipped]"
            else
                printf ' %s\n' "ecosystem.config.cjs written"
            fi
        else
            printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
            printf ' %s\n' "ecosystem.config.cjs already present"
        fi
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

phase_deps() {
    phase "INSTALLING DEPENDENCIES"
    if [ ! -f package.json ]; then
        die "package.json not found in $(pwd)" "deps"
    fi
    if [ "$INSTALL_MODE" = "node" ]; then
        install_node_fx || die "Node.js >= 20 (with npm) is required and could not be installed" "deps"
    fi
    if [ -d node_modules ] && [ -x node_modules/.bin/vite ] && [ -d node_modules/express ]; then
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "node_modules already installed"
        return 0
    fi
    run_fx "npm install (this can take a few minutes)" matrix -- \
        npm install --no-audit --no-fund --legacy-peer-deps \
        || run_fx "npm install (retry, forced)" matrix -- \
        npm install --no-audit --no-fund --legacy-peer-deps --force \
        || die "npm install failed — check $LOG" "deps"
}

phase_build() {
    phase "BUILDING PANEL BUNDLE"
    if [ -f dist/server.cjs ] && [ -f dist/index.html ]; then
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "dist/ already built"
        return 0
    fi
    [ "$OPT_DRY" != "1" ] && rm -rf dist
    run_fx "vite + esbuild production bundle" matrix -- \
        env NODE_OPTIONS=--max-old-space-size=2048 npm run build \
        || die "build failed — check $LOG" "build"
    if [ "$OPT_DRY" != "1" ] && { [ ! -f dist/server.cjs ] || [ ! -f dist/index.html ]; }; then
        die "build artifacts missing (dist/server.cjs, dist/index.html)" "build"
    fi
}

phase_launch() {
    phase "LAUNCHING PROTO PANEL"
    local c d
    if [ "$INSTALL_MODE" = "docker" ]; then
        d=$(get_docker_cmd)
        c=$(get_compose_cmd)
        if [ "$OPT_DRY" != "1" ]; then
            $d rm -f proto-main >> "$LOG" 2>&1 || true
        fi
        export PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS"
        run_fx "docker compose up -d --build proto-main" bar -- $c up -d --build proto-main \
            || die "docker compose failed — check $LOG" "launch"
        if [ "$OPT_DRY" = "1" ]; then
            printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
            printf ' %s\n' "container proto-main [dry-run · assumed running]"
            return 0
        fi
        # wait until container reports running
        local st tries=0
        while [ $tries -lt 20 ]; do
            st=$($d inspect --format '{{.State.Status}}' proto-main 2>/dev/null || echo "not_found")
            [ "$st" = "running" ] && break
            if [ "$st" = "exited" ] || [ "$st" = "dead" ]; then
                $d logs proto-main --tail 40 >> "$LOG" 2>&1 || true
                die "container proto-main $st — see $LOG" "launch"
            fi
            printf '\r%s' "$CLRL"
            printf '  '
            if [ "$FX" = "1" ]; then
                fg 110 200 255
                printf '%s' "$BOLD$FG_OUT${PULSE_F[$(( tries % ${#PULSE_F[@]} ))]}$RESET"
                printf ' waiting for container ...'
            else
                printf 'waiting for container to reach running state (%d/20)' "$(( tries + 1 ))"
            fi
            sleep 1.5
            tries=$(( tries + 1 ))
        done
        printf '\r%s\n' "$CLRL"
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "container proto-main is running"
    else
        # ensure pm2 first, then clean up old processes
        if ! have pm2 && [ ! -x ./node_modules/.bin/pm2 ] && [ ! -x /usr/local/bin/pm2 ]; then
            run_fx "installing pm2" spin -- npm install -g pm2 --no-audit --no-fund \
                || run_fx "installing pm2 (local)" spin -- npm install --no-save pm2 --no-audit --no-fund \
                || die "pm2 installation failed" "launch"
        fi
        export PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS"
        if [ "$OPT_DRY" != "1" ]; then
            run_pm2 delete proto-main >/dev/null 2>&1 || true
            run_pm2 delete proto-panel >/dev/null 2>&1 || true
        fi
        run_fx "pm2 start proto-main" bar -- bash -c 'if command -v pm2 >/dev/null 2>&1; then pm2 start ecosystem.config.cjs --only proto-main && pm2 save --force; elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 start ecosystem.config.cjs --only proto-main && ./node_modules/.bin/pm2 save --force; else npm start; fi' \
            || die "pm2 failed to start the panel" "launch"
    fi
}

run_pm2() {
    if have pm2; then pm2 "$@"
    elif [ -x /usr/local/bin/pm2 ]; then /usr/local/bin/pm2 "$@"
    elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 "$@"
    else return 1
    fi
}

phase_health() {
    phase "HEALTH CHECK"
    local port="$PANEL_PORT" tries=0 max=30 ok=0
    if [ "$OPT_DRY" = "1" ]; then
        printf '  '; fg_info; printf '%s [dry-run · assumed healthy]\n' "$ICO_INFO"; printf '%s' "$RESET"
        return 0
    fi
    cur_hide
    while [ $tries -lt $max ]; do
        if curl -s -f -m 4 "http://127.0.0.1:$port/api/health" >> "$LOG" 2>&1 \
           || curl -s -f -m 4 "http://127.0.0.1:$port/" >> "$LOG" 2>&1; then
            ok=1; break
        fi
        tries=$(( tries + 1 ))
        if [ "$FX" = "1" ]; then
            printf '\r%s' "$CLRL"
            printf '  '
            if [ $(( tries % 2 )) -eq 0 ]; then fg 110 200 255; else fg 80 250 123; fi
            printf '%s' "$BOLD$FG_OUT${PULSE_F[$(( tries % ${#PULSE_F[@]} ))]}$RESET"
            printf ' '
            grad_print "waiting for panel on :$port" 110 200 255 80 250 123
            printf '%s' "$DIM"; printf '  attempt %d/%d%s' "$tries" "$max" "$RESET"
        else
            printf '  waiting for panel on :%s (attempt %d/%d)\n' "$port" "$tries" "$max"
        fi
        sleep 1.2
    done
    cur_show
    if [ "$ok" = "1" ]; then
        printf '\r%s' "$CLRL"
        printf '  '; fg_ok; printf '%s' "$ICO_OK"; printf '%s' "$RESET"
        printf ' %s\n' "panel answers on http://127.0.0.1:$port (attempt $tries)"
    else
        printf '\r%s' "$CLRL"
        die "panel did not become healthy within $(( max * 2 ))s — see $LOG" "health"
    fi
}


phase_owner() {
    phase "OWNER ACCOUNT"
    printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
    printf ' creating owner account: '
    fg_white; printf '%s\n' "$OWNER_USER$RESET"
    if [ "$OPT_DRY" = "1" ]; then
        printf '  '; fg_info; printf '%s [dry-run · skipped]\n' "$ICO_INFO"; printf '%s' "$RESET"
        return 0
    fi
    MASK_NEXT=1
    if [ "$INSTALL_MODE" = "docker" ]; then
        local d; d=$(get_docker_cmd)
        run_fx "docker exec createuser" spin -- $d exec \
            -e PROTO_OWNER_USER="$OWNER_USER" -e PROTO_OWNER_PASS="$OWNER_PASS" \
            proto-main npm run createuser \
            || { MASK_NEXT=1; run_fx "host-side createuser fallback" spin -- \
                 env PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS" npm run createuser \
                 || printf '  %s\n' "$DIM(owner account can also be created later: bash install.sh)$RESET"; }
    else
        run_fx "npm run createuser" spin -- \
            env PROTO_OWNER_USER="$OWNER_USER" PROTO_OWNER_PASS="$OWNER_PASS" npm run createuser \
            || printf '  %s\n' "$DIM(owner account can also be created later: bash install.sh)$RESET"
    fi
}

phase_summary() {
    local title="${1:-INSTALLATION COMPLETE}"
    local el=$(( $(date +%s) - START_TS ))
    local mm=$(( el / 60 )) ss=$(( el % 60 ))
    local url="http://$SYS_IP:$PANEL_PORT"

    cls
    build_logo "PROTO" "PANEL"
    show_logo
    printf '\n'

    glow_box "$title" \
        "  $ICO_SPARK Panel      $url" \
        "  $ICO_SPARK Mode       $INSTALL_MODE" \
        "  $ICO_SPARK Username   $OWNER_USER" \
        "  $ICO_SPARK Password   $OWNER_PASS_SHOW" \
        "  $ICO_SPARK Health     OK (/api/health)" \
        "  $ICO_SPARK Elapsed    ${mm}m ${ss}s" \
        "  $ICO_SPARK Log        ./$LOG"

    printf '\n'
    printf '  %s ' "$DIM"
    grad_print "NEXT STEPS" 140 160 200 140 160 200
    printf '%s\n' "$RESET"
    printf '   %s %s\n' "$ICO_ARROW" "open $url in your browser and log in"
    printf '   %s %s\n' "$ICO_ARROW" "manage the panel any time:  bash install.sh"
    printf '   %s %s\n' "$ICO_ARROW" "troubleshooting:             less $LOG"
    printf '\n'
    confetti
    printf '  '
    grad_print "$PANEL_NAME · $INSTALLER_NAME installer v$INSTALLER_VER" 140 160 200 90 130 200
    printf '\n\n'
}

# ============================================================================
#  SECTION 8 · DEMO MODE (FX showcase — installs nothing)
# ============================================================================

demo() {
    cls
    build_logo "PROTO" "PANEL"
    show_logo
    printf '\n'
    center_print "PRISM INSTALLER · FX SHOWCASE"
    scan_sweep 2

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
#  SECTION 9 · UPDATE FLOW
# ============================================================================

update_flow() {
    phase "UPDATING PANEL SOURCE"
    if [ -d .git ]; then
        run_fx "git pull latest changes" bar -- git pull \
            || die "git pull failed — see $LOG" "update"
    else
        printf '  '; fg_warn; printf '%s' "$ICO_WARN"; printf '%s' "$RESET"
        printf ' %s\n' "not a git checkout — skipping source update"
    fi
    phase_deps
    phase_build
    phase "RESTARTING SERVICES"
    local c d
    if [ "$INSTALL_MODE" = "docker" ]; then
        d=$(get_docker_cmd); c=$(get_compose_cmd)
        run_fx "docker compose up -d --build (recreate)" bar -- $c up -d --build proto-main \
            || die "docker compose failed — see $LOG" "update"
    else
        run_fx "pm2 restart proto-main" bar -- bash -c 'if command -v pm2 >/dev/null 2>&1; then pm2 restart proto-main || pm2 start ecosystem.config.cjs --only proto-main; elif [ -x ./node_modules/.bin/pm2 ]; then ./node_modules/.bin/pm2 restart proto-main || ./node_modules/.bin/pm2 start ecosystem.config.cjs --only proto-main; fi' \
            || die "pm2 restart failed — see $LOG" "update"
    fi
    phase_health
    if [ "$OWNER_PROVIDED" = "1" ]; then
        phase_owner
    else
        OWNER_PASS_SHOW="(unchanged)"
    fi
    phase_summary "UPDATE COMPLETE"
}

# ============================================================================
#  SECTION 10 · ARGUMENTS · USAGE · MAIN
# ============================================================================

usage() {
    setup_term
    printf '\n'
    grad_print "  $PANEL_NAME — $INSTALLER_NAME Automatic Installer v$INSTALLER_VER" 120 160 255 190 110 255
    printf '\n\n'
    printf '  %s\n' "Fully automatic, animated installer for $PANEL_NAME."
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
    printf '   %-26s %s\n' "--fast"          "halve animation times (slow terminals)"
    printf '   %-26s %s\n' "--no-color"      "disable colors and animations"
    printf '   %-26s %s\n' "--truecolor"     "force 24-bit color"
    printf '   %-26s %s\n' "--256"           "force 256-color mode"
    printf '   %-26s %s\n' "-h, --help"      "this help"
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

    LOG="$LOG_FILE"
    [ -n "$PROTO_INSTALL_LOG" ] && LOG="$PROTO_INSTALL_LOG"
    : > "$LOG" 2>/dev/null || LOG="/tmp/proto-install.log"
    hr_log
    log "$PANEL_NAME installer v$INSTALLER_VER started (pid $$)"
    log "args: demo=$OPT_DEMO dry=$OPT_DRY update=$OPT_UPDATE mode=$OPT_MODE color=$COLOR_MODE fx=$FX width=$W"

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

    # ---- intro -------------------------------------------------------------
    cls
    build_logo "PROTO" "PANEL"
    show_logo
    printf '\n'
    center_pad "$PANEL_TAGLINE"; typew "$PANEL_TAGLINE" 160 200 255 220 160 255 18
    local iv_pre="installer: " iv_name iv_suf=" · fully automatic · zero questions asked"
    iv_name="$INSTALLER_NAME v$INSTALLER_VER"
    center_pad "$iv_pre$iv_name$iv_suf"
    printf '%s' "$iv_pre"
    grad_print "$iv_name" 255 200 90 255 120 140
    printf '%s\n' "$DIM$iv_suf$RESET"
    scan_sweep 2

    # ---- pipeline ----------------------------------------------------------
    phase_scan
    phase_preflight
    phase_source

    # silent mode detection, then display
    detect_mode
    phase_mode

    if [ "$OPT_UPDATE" = "1" ]; then
        update_flow
        exit 0
    fi

    phase_env
    if [ "$INSTALL_MODE" = "node" ]; then
        phase_deps
        phase_build
    fi
    phase_launch
    phase_health
    phase_owner
    phase_summary

    QUIET_EXIT=1
    log "completed successfully in $(( $(date +%s) - START_TS ))s"
    exit 0
}

# detect_mode — silent decision (docker preferred, node fallback)
detect_mode() {
    local d
    if [ "$OPT_MODE" != "auto" ]; then
        INSTALL_MODE="$OPT_MODE"
        if [ "$INSTALL_MODE" = "docker" ]; then
            d=$(get_docker_cmd)
            if ! have docker; then
                run_fx "docker requested but missing — installing it" matrix -- bash -c 'curl -fsSL https://get.docker.com | sh'
            fi
            d=$(get_docker_cmd)
            if have docker; then
                if $d info >/dev/null 2>&1; then
                    :
                elif [ "$(id -u)" = "0" ] || sudo_nonint; then
                    run_fx "starting docker daemon" spin -- run_root systemctl enable --now docker || true
                else
                    printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
                    printf ' %s\n' "docker installed but daemon not reachable (start it manually if needed)"
                    log "docker daemon not reachable; sudo needs a password — not starting daemon"
                fi
            elif [ "$OPT_DRY" = "1" ]; then
                printf '  '; fg_info; printf '%s' "$ICO_INFO"; printf '%s' "$RESET"
                printf ' %s\n' "dry-run: docker unavailable here — rehearsing in node mode"
                log "DRY-RUN: docker unavailable, rehearsing in node mode"
                INSTALL_MODE="node"
            else
                die "--mode=docker was requested but Docker could not be installed" "mode"
            fi
        fi
        return
    fi
    d=$(get_docker_cmd)
    if have docker && $d info >/dev/null 2>&1; then
        INSTALL_MODE="docker"
        return
    fi
    if [ "$(id -u)" = "0" ] || sudo_nonint; then
        run_fx "docker not found — installing it" matrix -- bash -c 'curl -fsSL https://get.docker.com | sh'
        d=$(get_docker_cmd)
        if have docker && $d info >/dev/null 2>&1; then
            INSTALL_MODE="docker"
            return
        fi
    fi
    INSTALL_MODE="node"
}

# phase_mode — display the (already made) decision
phase_mode() {
    phase "CHOOSING DEPLOYMENT MODE"
    printf '  '
    grad_print "DEPLOYMENT MODE" 140 160 200 140 160 200
    printf ' %s' "$DIM──$RESET "
    if [ "$INSTALL_MODE" = "docker" ]; then
        grad_print "DOCKER" 80 200 255 120 255 180
        printf ' %s\n' "$DIM(container proto-main · restart unless-stopped)$RESET"
    else
        grad_print "NODE + PM2" 255 180 90 255 120 140
        printf ' %s\n' "$DIM(process proto-main · managed by pm2)$RESET"
    fi
    log "MODE=$INSTALL_MODE"
}

main "$@"
