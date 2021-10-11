import { Snowflake } from "discord-api-types/v9";

import {SignJWT} from "jose/jwt/sign"
import { getSecondsNow } from "./utils";
import {importPKCS8} from "jose/key/import"
const algorithm = "ES256"

interface extraPayload {
    staff?: true
}


const createJWT = async (userId: Snowflake, staff?: boolean): Promise<string> => {
    const privateKey = await importPKCS8(privateSigningKey, algorithm)
    let extraPayload: extraPayload = {}
    if (staff){
        extraPayload = {staff}
    }
    return new SignJWT({userId: userId, ...extraPayload})
        .setProtectedHeader({ alg: algorithm })
        .setIssuedAt()
        .setExpirationTime(getSecondsNow() + 60 * 60 * 4) // 4 hours
        .sign(privateKey)
    
};
export {createJWT}