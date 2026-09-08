/**
 * Reviewed Saheeh International phrase boundaries.  These are not translated
 * text: each entry is an ordered boundary marker in the immutable parent
 * translation.  The Arabic word end is authoritative; a marker is used only
 * when it can be found verbatim in that selected source translation.
 */
export type SaheehPhraseMap = Readonly<Record<string, readonly { wordEnd: number; endsWith: string }[]>>;

export const SAHEEH_PHRASE_BOUNDARIES: SaheehPhraseMap = {
  "18:57": [
    { wordEnd: 17, endsWith: "what his hands have put forth?" },
    { wordEnd: 32, endsWith: "then - ever." },
  ],
  "2:255": [
    { wordEnd: 14, endsWith: "Neither drowsiness overtakes Him nor sleep." },
    { wordEnd: 30, endsWith: "except by His permission?" },
    { wordEnd: 46, endsWith: "except for what He wills." },
    { wordEnd: 58, endsWith: "the Most Great." },
  ],
  "2:282": [
    { wordEnd: 14, endsWith: "between you in justice." },
    { wordEnd: 30, endsWith: "not leave anything out of it." },
    { wordEnd: 48, endsWith: "then let his guardian dictate in justice." },
    { wordEnd: 64, endsWith: "then the other can remind her." },
    { wordEnd: 78, endsWith: "for its [specified] term." },
    { wordEnd: 96, endsWith: "if you do not write it." },
    { wordEnd: 111, endsWith: "Let no scribe be harmed or any witness." },
    { wordEnd: 128, endsWith: "And Allah teaches you." },
    { wordEnd: 144, endsWith: "And Allah is Knowing of all things." },
  ],
};
