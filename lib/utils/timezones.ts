/**
 * Comprehensive Timezone Utilities
 * Provides all IANA timezones with friendly labels organized by region
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TimezoneOption {
  value: string      // IANA timezone identifier (e.g., "America/New_York")
  label: string      // Human-readable label
  region: string     // Region for grouping
  offset?: string    // Current UTC offset (e.g., "-05:00")
}

export interface TimezoneRegion {
  name: string
  timezones: TimezoneOption[]
}

// =============================================================================
// ALL TIMEZONES - Comprehensive list organized by region
// =============================================================================

export const ALL_TIMEZONES: TimezoneOption[] = [
  // ============================================
  // AFRICA
  // ============================================
  { value: "Africa/Abidjan", label: "Abidjan", region: "Africa" },
  { value: "Africa/Accra", label: "Accra", region: "Africa" },
  { value: "Africa/Addis_Ababa", label: "Addis Ababa", region: "Africa" },
  { value: "Africa/Algiers", label: "Algiers", region: "Africa" },
  { value: "Africa/Cairo", label: "Cairo", region: "Africa" },
  { value: "Africa/Casablanca", label: "Casablanca", region: "Africa" },
  { value: "Africa/Dar_es_Salaam", label: "Dar es Salaam", region: "Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg", region: "Africa" },
  { value: "Africa/Khartoum", label: "Khartoum", region: "Africa" },
  { value: "Africa/Lagos", label: "Lagos", region: "Africa" },
  { value: "Africa/Nairobi", label: "Nairobi", region: "Africa" },
  { value: "Africa/Tunis", label: "Tunis", region: "Africa" },

  // ============================================
  // AMERICAS - North America
  // ============================================
  { value: "America/Anchorage", label: "Anchorage (AKST)", region: "North America" },
  { value: "America/Chicago", label: "Chicago (Central)", region: "North America" },
  { value: "America/Denver", label: "Denver (Mountain)", region: "North America" },
  { value: "America/Detroit", label: "Detroit (Eastern)", region: "North America" },
  { value: "America/Edmonton", label: "Edmonton (Mountain)", region: "North America" },
  { value: "America/Halifax", label: "Halifax (Atlantic)", region: "North America" },
  { value: "America/Los_Angeles", label: "Los Angeles (Pacific)", region: "North America" },
  { value: "America/New_York", label: "New York (Eastern)", region: "North America" },
  { value: "America/Phoenix", label: "Phoenix (Arizona)", region: "North America" },
  { value: "America/Toronto", label: "Toronto (Eastern)", region: "North America" },
  { value: "America/Vancouver", label: "Vancouver (Pacific)", region: "North America" },
  { value: "America/Winnipeg", label: "Winnipeg (Central)", region: "North America" },
  { value: "Pacific/Honolulu", label: "Honolulu (Hawaii)", region: "North America" },

  // ============================================
  // AMERICAS - Central America & Caribbean
  // ============================================
  { value: "America/Cancun", label: "Cancun", region: "Central America" },
  { value: "America/Costa_Rica", label: "Costa Rica", region: "Central America" },
  { value: "America/El_Salvador", label: "El Salvador", region: "Central America" },
  { value: "America/Guatemala", label: "Guatemala", region: "Central America" },
  { value: "America/Havana", label: "Havana", region: "Central America" },
  { value: "America/Jamaica", label: "Jamaica", region: "Central America" },
  { value: "America/Mexico_City", label: "Mexico City", region: "Central America" },
  { value: "America/Panama", label: "Panama", region: "Central America" },
  { value: "America/Puerto_Rico", label: "Puerto Rico", region: "Central America" },
  { value: "America/Santo_Domingo", label: "Santo Domingo", region: "Central America" },
  { value: "America/Tegucigalpa", label: "Tegucigalpa", region: "Central America" },

  // ============================================
  // AMERICAS - South America
  // ============================================
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", region: "South America" },
  { value: "America/Bogota", label: "Bogota", region: "South America" },
  { value: "America/Caracas", label: "Caracas", region: "South America" },
  { value: "America/Guayaquil", label: "Guayaquil", region: "South America" },
  { value: "America/La_Paz", label: "La Paz", region: "South America" },
  { value: "America/Lima", label: "Lima", region: "South America" },
  { value: "America/Montevideo", label: "Montevideo", region: "South America" },
  { value: "America/Santiago", label: "Santiago", region: "South America" },
  { value: "America/Sao_Paulo", label: "São Paulo", region: "South America" },

  // ============================================
  // ASIA - East Asia
  // ============================================
  { value: "Asia/Hong_Kong", label: "Hong Kong", region: "East Asia" },
  { value: "Asia/Macau", label: "Macau", region: "East Asia" },
  { value: "Asia/Seoul", label: "Seoul", region: "East Asia" },
  { value: "Asia/Shanghai", label: "Shanghai / Beijing", region: "East Asia" },
  { value: "Asia/Taipei", label: "Taipei", region: "East Asia" },
  { value: "Asia/Tokyo", label: "Tokyo", region: "East Asia" },
  { value: "Asia/Ulaanbaatar", label: "Ulaanbaatar", region: "East Asia" },

  // ============================================
  // ASIA - Southeast Asia
  // ============================================
  { value: "Asia/Bangkok", label: "Bangkok", region: "Southeast Asia" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City", region: "Southeast Asia" },
  { value: "Asia/Jakarta", label: "Jakarta", region: "Southeast Asia" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur", region: "Southeast Asia" },
  { value: "Asia/Manila", label: "Manila", region: "Southeast Asia" },
  { value: "Asia/Phnom_Penh", label: "Phnom Penh", region: "Southeast Asia" },
  { value: "Asia/Singapore", label: "Singapore", region: "Southeast Asia" },
  { value: "Asia/Yangon", label: "Yangon", region: "Southeast Asia" },

  // ============================================
  // ASIA - South Asia
  // ============================================
  { value: "Asia/Colombo", label: "Colombo", region: "South Asia" },
  { value: "Asia/Dhaka", label: "Dhaka", region: "South Asia" },
  { value: "Asia/Karachi", label: "Karachi (Pakistan)", region: "South Asia" },
  { value: "Asia/Kathmandu", label: "Kathmandu", region: "South Asia" },
  { value: "Asia/Kolkata", label: "Kolkata / Mumbai (India)", region: "South Asia" },
  { value: "Asia/Thimphu", label: "Thimphu", region: "South Asia" },

  // ============================================
  // ASIA - Central Asia
  // ============================================
  { value: "Asia/Almaty", label: "Almaty", region: "Central Asia" },
  { value: "Asia/Bishkek", label: "Bishkek", region: "Central Asia" },
  { value: "Asia/Dushanbe", label: "Dushanbe", region: "Central Asia" },
  { value: "Asia/Tashkent", label: "Tashkent", region: "Central Asia" },

  // ============================================
  // ASIA - Middle East
  // ============================================
  { value: "Asia/Amman", label: "Amman", region: "Middle East" },
  { value: "Asia/Baghdad", label: "Baghdad", region: "Middle East" },
  { value: "Asia/Bahrain", label: "Bahrain", region: "Middle East" },
  { value: "Asia/Beirut", label: "Beirut", region: "Middle East" },
  { value: "Asia/Damascus", label: "Damascus", region: "Middle East" },
  { value: "Asia/Dubai", label: "Dubai", region: "Middle East" },
  { value: "Asia/Jerusalem", label: "Jerusalem", region: "Middle East" },
  { value: "Asia/Kuwait", label: "Kuwait", region: "Middle East" },
  { value: "Asia/Muscat", label: "Muscat", region: "Middle East" },
  { value: "Asia/Qatar", label: "Qatar", region: "Middle East" },
  { value: "Asia/Riyadh", label: "Riyadh", region: "Middle East" },
  { value: "Asia/Tehran", label: "Tehran", region: "Middle East" },

  // ============================================
  // EUROPE - Western Europe
  // ============================================
  { value: "Europe/Amsterdam", label: "Amsterdam", region: "Western Europe" },
  { value: "Europe/Brussels", label: "Brussels", region: "Western Europe" },
  { value: "Europe/Dublin", label: "Dublin", region: "Western Europe" },
  { value: "Europe/Lisbon", label: "Lisbon", region: "Western Europe" },
  { value: "Europe/London", label: "London", region: "Western Europe" },
  { value: "Europe/Luxembourg", label: "Luxembourg", region: "Western Europe" },
  { value: "Europe/Madrid", label: "Madrid", region: "Western Europe" },
  { value: "Europe/Paris", label: "Paris", region: "Western Europe" },

  // ============================================
  // EUROPE - Central Europe
  // ============================================
  { value: "Europe/Berlin", label: "Berlin", region: "Central Europe" },
  { value: "Europe/Budapest", label: "Budapest", region: "Central Europe" },
  { value: "Europe/Copenhagen", label: "Copenhagen", region: "Central Europe" },
  { value: "Europe/Oslo", label: "Oslo", region: "Central Europe" },
  { value: "Europe/Prague", label: "Prague", region: "Central Europe" },
  { value: "Europe/Rome", label: "Rome", region: "Central Europe" },
  { value: "Europe/Stockholm", label: "Stockholm", region: "Central Europe" },
  { value: "Europe/Vienna", label: "Vienna", region: "Central Europe" },
  { value: "Europe/Warsaw", label: "Warsaw", region: "Central Europe" },
  { value: "Europe/Zurich", label: "Zurich", region: "Central Europe" },

  // ============================================
  // EUROPE - Eastern Europe
  // ============================================
  { value: "Europe/Athens", label: "Athens", region: "Eastern Europe" },
  { value: "Europe/Bucharest", label: "Bucharest", region: "Eastern Europe" },
  { value: "Europe/Helsinki", label: "Helsinki", region: "Eastern Europe" },
  { value: "Europe/Istanbul", label: "Istanbul", region: "Eastern Europe" },
  { value: "Europe/Kiev", label: "Kyiv", region: "Eastern Europe" },
  { value: "Europe/Minsk", label: "Minsk", region: "Eastern Europe" },
  { value: "Europe/Moscow", label: "Moscow", region: "Eastern Europe" },
  { value: "Europe/Riga", label: "Riga", region: "Eastern Europe" },
  { value: "Europe/Sofia", label: "Sofia", region: "Eastern Europe" },
  { value: "Europe/Tallinn", label: "Tallinn", region: "Eastern Europe" },
  { value: "Europe/Vilnius", label: "Vilnius", region: "Eastern Europe" },

  // ============================================
  // AUSTRALIA & OCEANIA
  // ============================================
  { value: "Australia/Adelaide", label: "Adelaide", region: "Australia" },
  { value: "Australia/Brisbane", label: "Brisbane", region: "Australia" },
  { value: "Australia/Darwin", label: "Darwin", region: "Australia" },
  { value: "Australia/Hobart", label: "Hobart", region: "Australia" },
  { value: "Australia/Melbourne", label: "Melbourne", region: "Australia" },
  { value: "Australia/Perth", label: "Perth", region: "Australia" },
  { value: "Australia/Sydney", label: "Sydney", region: "Australia" },
  { value: "Pacific/Auckland", label: "Auckland", region: "Pacific" },
  { value: "Pacific/Fiji", label: "Fiji", region: "Pacific" },
  { value: "Pacific/Guam", label: "Guam", region: "Pacific" },
  { value: "Pacific/Noumea", label: "Noumea", region: "Pacific" },
  { value: "Pacific/Pago_Pago", label: "Pago Pago", region: "Pacific" },
  { value: "Pacific/Port_Moresby", label: "Port Moresby", region: "Pacific" },
  { value: "Pacific/Tahiti", label: "Tahiti", region: "Pacific" },

  // ============================================
  // OTHER / UTC
  // ============================================
  { value: "UTC", label: "UTC (Coordinated Universal Time)", region: "UTC" },
  { value: "Etc/GMT", label: "GMT (Greenwich Mean Time)", region: "UTC" },
  { value: "Etc/GMT+12", label: "GMT-12:00", region: "UTC" },
  { value: "Etc/GMT+11", label: "GMT-11:00", region: "UTC" },
  { value: "Etc/GMT+10", label: "GMT-10:00", region: "UTC" },
  { value: "Etc/GMT+9", label: "GMT-09:00", region: "UTC" },
  { value: "Etc/GMT+8", label: "GMT-08:00", region: "UTC" },
  { value: "Etc/GMT+7", label: "GMT-07:00", region: "UTC" },
  { value: "Etc/GMT+6", label: "GMT-06:00", region: "UTC" },
  { value: "Etc/GMT+5", label: "GMT-05:00", region: "UTC" },
  { value: "Etc/GMT+4", label: "GMT-04:00", region: "UTC" },
  { value: "Etc/GMT+3", label: "GMT-03:00", region: "UTC" },
  { value: "Etc/GMT+2", label: "GMT-02:00", region: "UTC" },
  { value: "Etc/GMT+1", label: "GMT-01:00", region: "UTC" },
  { value: "Etc/GMT-1", label: "GMT+01:00", region: "UTC" },
  { value: "Etc/GMT-2", label: "GMT+02:00", region: "UTC" },
  { value: "Etc/GMT-3", label: "GMT+03:00", region: "UTC" },
  { value: "Etc/GMT-4", label: "GMT+04:00", region: "UTC" },
  { value: "Etc/GMT-5", label: "GMT+05:00", region: "UTC" },
  { value: "Etc/GMT-6", label: "GMT+06:00", region: "UTC" },
  { value: "Etc/GMT-7", label: "GMT+07:00", region: "UTC" },
  { value: "Etc/GMT-8", label: "GMT+08:00", region: "UTC" },
  { value: "Etc/GMT-9", label: "GMT+09:00", region: "UTC" },
  { value: "Etc/GMT-10", label: "GMT+10:00", region: "UTC" },
  { value: "Etc/GMT-11", label: "GMT+11:00", region: "UTC" },
  { value: "Etc/GMT-12", label: "GMT+12:00", region: "UTC" },
  { value: "Etc/GMT-13", label: "GMT+13:00", region: "UTC" },
  { value: "Etc/GMT-14", label: "GMT+14:00", region: "UTC" },
]

// =============================================================================
// TIMEZONE REGIONS (for grouped display)
// =============================================================================

export const TIMEZONE_REGIONS = [
  "North America",
  "Central America",
  "South America",
  "Western Europe",
  "Central Europe",
  "Eastern Europe",
  "Middle East",
  "South Asia",
  "Southeast Asia",
  "East Asia",
  "Central Asia",
  "Africa",
  "Australia",
  "Pacific",
  "UTC",
]

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the current UTC offset for a timezone
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')
    return offsetPart?.value || ''
  } catch {
    return ''
  }
}

/**
 * Format a date in a specific timezone
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...options,
    }
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date)
  } catch {
    return date.toISOString()
  }
}

/**
 * Get the timezone name in a readable format
 */
export function getTimezoneName(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long',
    })
    const parts = formatter.formatToParts(now)
    const tzName = parts.find(p => p.type === 'timeZoneName')
    return tzName?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Get short timezone abbreviation
 */
export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })
    const parts = formatter.formatToParts(now)
    const tzName = parts.find(p => p.type === 'timeZoneName')
    return tzName?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Format appointment time showing both the meeting timezone and a comparison timezone
 */
export function formatAppointmentTimeMultiZone(
  date: Date,
  meetingTimezone: string,
  comparisonTimezone?: string
): {
  meetingTime: string
  meetingTimezoneLabel: string
  comparisonTime?: string
  comparisonTimezoneLabel?: string
} {
  const meetingTime = formatInTimezone(date, meetingTimezone)
  const meetingTimezoneLabel = `${getTimezoneAbbreviation(meetingTimezone)} (${getTimezoneOffset(meetingTimezone)})`

  if (comparisonTimezone && comparisonTimezone !== meetingTimezone) {
    const comparisonTime = formatInTimezone(date, comparisonTimezone)
    const comparisonTimezoneLabel = `${getTimezoneAbbreviation(comparisonTimezone)} (${getTimezoneOffset(comparisonTimezone)})`
    return {
      meetingTime,
      meetingTimezoneLabel,
      comparisonTime,
      comparisonTimezoneLabel,
    }
  }

  return {
    meetingTime,
    meetingTimezoneLabel,
  }
}

/**
 * Get timezones grouped by region
 */
export function getTimezonesByRegion(): TimezoneRegion[] {
  return TIMEZONE_REGIONS.map(region => ({
    name: region,
    timezones: ALL_TIMEZONES.filter(tz => tz.region === region),
  })).filter(region => region.timezones.length > 0)
}

/**
 * Search timezones by name or region
 */
export function searchTimezones(query: string): TimezoneOption[] {
  const lowerQuery = query.toLowerCase()
  return ALL_TIMEZONES.filter(
    tz =>
      tz.value.toLowerCase().includes(lowerQuery) ||
      tz.label.toLowerCase().includes(lowerQuery) ||
      tz.region.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get user's browser/system timezone
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Validate if a timezone string is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

