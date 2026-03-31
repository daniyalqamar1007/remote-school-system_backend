export function getLocalTimeFromUTC(utcTime:string,TimeZone:string) {
    return new Date(utcTime).toLocaleString('en-US', { timeZone: TimeZone });
  }

