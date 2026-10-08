import { createContext } from 'react'

/** What the rail body is rendering INTO. The fixed desktop rail and the
 *  phone drawer both render expanded, so this is always `false` for now;
 *  it stays a context so a collapsible rail can be added without touching
 *  the body. */
export const RailCollapsedContext = createContext(false)
