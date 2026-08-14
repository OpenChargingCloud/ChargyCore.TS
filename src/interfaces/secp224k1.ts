/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of ChargyCore <https://github.com/OpenChargingCloud/ChargyCore.TS>
 *
 * Licensed under the Affero GPL license, Version 3.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.gnu.org/licenses/agpl.html
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Based on: https://github.com/CraigglesO/elliptic-curve-signature-algo
 *
 * secp224k1 is not provided by @noble/curves, so this small implementation
 * exists to keep verifying the legacy ChargePoint and Alfen charging data that
 * still uses it. If a vetted secp224k1 implementation becomes available, this
 * file should be replaced by it.
 *
 * Scope and limitations:
 *
 *   - validate() is the only method used in production. It verifies signatures,
 *     so every input is public and there is no secret to leak through timing.
 *     It is written to fail closed: anything that is not a well-formed point on
 *     the curve, and any failure while computing, results in 'false'.
 *
 *   - Sign() and PublicKeyGenerate() handle private keys and must NOT be used
 *     in production. The modular arithmetic is not constant time, and Sign()
 *     takes the nonce from the caller, so it offers no protection against
 *     nonce reuse, which would disclose the private key. Use @noble/curves for
 *     anything involving a secret.
 *
 * const GcompressedLE   = BigInt("0xA1455B334DF099DF30FC28A169A467E9E47075A90F7E650EB6B7A45C");
 * const GunCompressedLE = BigInt("0xA1455B334DF099DF30FC28A169A467E9E47075A90F7E650EB6B7A45C7E089FED7FBA344282CAFBD6F7E319F7C0B0BD59E2CA4BDB556D61A5");
 *
 * Actual curve: y^2 = x^3 + Acurve * x + Bcurve
  */

export class secp224k1 {

    // Pcurve = 2**224 - 2**32 - 2**12 - 2**11 - 2**9 - 2**7 - 2**4 - 2**1 - 1 or
    //          FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE FFFFE56D
    private readonly Zero   = BigInt("0");
    private readonly One    = BigInt("1");
    private readonly Two    = BigInt("2");
    private readonly Three  = BigInt("3");
    private readonly Pcurve = BigInt("26959946667150639794667015087019630673637144422540572481099315275117"); // The proven prime
    private readonly N      = BigInt("0x010000000000000000000000000001DCE8D2EC6184CAF0A971769FB1F7"); // Number of points in the field
    private readonly Acurve = BigInt(0); // Defined on the elliptic curve. y^2 = x^3 + Acurve * x + Bcurve
    private readonly Bcurve = BigInt(5); // secp224k1 has a = 0 and b = 5, and a cofactor of 1, so every
                                         // point on the curve except infinity has order N.
    private readonly Gx     = BigInt("0xA1455B334DF099DF30FC28A169A467E9E47075A90F7E650EB6B7A45C");
    private readonly Gy     = BigInt("0x7E089FED7FBA344282CAFBD6F7E319F7C0B0BD59E2CA4BDB556D61A5");
    private readonly GPoint = [this.Gx, this.Gy]; // This is our generator point. Trillions of dif ones possible

    public Sign(hash:          bigint,
                RandomNumber:  bigint,
                privateKey:    bigint) : Array<bigint> | null
    {

        const RandSignPoint = this.ECmultiply(this.GPoint, RandomNumber);

        if (RandSignPoint.length >= 1 && RandSignPoint[0] != null)
        {

            const r = this.modulo(RandSignPoint[0], this.N);
            const s = this.modulo((hash + r*privateKey) * (this.modInv(RandomNumber, this.N)), this.N);

            return [ r, s ];

        }

        return null;

    }

    // Returns true only for a signature that verifies against a public key which
    // is a valid point on the curve. Every other outcome is false, including a
    // point off the curve and any failure while computing, so that a caller
    // trying several candidate keys is never interrupted by an exception.
    public validate(hash:        bigint,
                    signatureR:  bigint,
                    signatureS:  bigint,
                    PublicKey:   Array<bigint>) : boolean
    {

        if (signatureR <= this.Zero || signatureR >= this.N)
            throw new Error("Invalid R");

        if (signatureS <= this.Zero || signatureS >= this.N)
            throw new Error("Invalid S");

        // Without this check an attacker-supplied point outside the curve would
        // be fed straight into the group arithmetic below.
        if (!this.isOnCurve(PublicKey))
            return false;

        try
        {

            const w           = this.modInv(signatureS, this.N);
            const u1          = this.ECmultiply(this.GPoint, this.modulo(w * hash,       this.N));
            const u2          = this.ECmultiply(PublicKey,   this.modulo(w * signatureR, this.N));
            const validation  = this.ECadd(u1, u2);
            const x           = validation[0];

            if (x === undefined)
                return false;

            return this.modulo(x, this.N) === signatureR;

        }
        catch
        {
            // u1 + u2 is the point at infinity, or a scalar degenerated to zero:
            // in every such case the signature simply does not verify.
            return false;
        }

    }

    // y^2 == x^3 + Acurve * x + Bcurve (mod Pcurve), with both coordinates
    // reduced. The point at infinity has no [x, y] representation here and is
    // therefore rejected along with everything else that is malformed.
    public isOnCurve(point: Array<bigint>) : boolean
    {

        const x = point[0];
        const y = point[1];

        if (x === undefined || y === undefined)
            return false;

        if (x < this.Zero || x >= this.Pcurve ||
            y < this.Zero || y >= this.Pcurve)
        {
            return false;
        }

        return this.modulo(y * y,                                    this.Pcurve) ===
               this.modulo(x * x * x + this.Acurve * x + this.Bcurve, this.Pcurve);

    }


    public modulo(n: bigint, m: bigint): bigint {
        return (((n % m) + m) % m);
    }

    public zfill(s: string): string {

        while (s.length < 56) {
            s = "0" + s;
        }

        return s;

    }

    public modInv(a: bigint, n: bigint = this.Pcurve): bigint {

      let lm    = BigInt(1),
          hm    = BigInt(0),
          high  = n,
          low   = this.modulo(a, n);

      // Without this guard the loop below is skipped and 1 is returned, which
      // silently produces a wrong result instead of reporting that there is no
      // inverse. Zero is the only non-invertible residue, as n is prime.
      if (low === this.Zero)
          throw new Error("Value is not invertible!");

      while (low > 1) {

          const ratio = high / low,
              nm    = hm   - (ratio*lm),
              newm  = high - (ratio*low);

          hm    = lm;
          lm    = nm;
          high  = low;
          low   = newm;

      }

      return this.modulo(lm, n);

    }

    public ECadd(a: Array<bigint>,
                 b: Array<bigint>) : Array<bigint>
    {

        if (a[0] != undefined && b[0] != undefined &&
            a[1] != undefined && b[1] != undefined)
        {

            // The chord-and-tangent formula below divides by (b.x - a.x) and is
            // undefined for two points sharing an x coordinate. Such a pair is
            // either the same point, which needs the doubling formula, or two
            // opposite points, whose sum is the point at infinity.
            if (this.modulo(a[0] - b[0], this.Pcurve) === this.Zero)
            {

                if (this.modulo(a[1] - b[1], this.Pcurve) === this.Zero &&
                    this.modulo(a[1], this.Pcurve)        !== this.Zero)
                {
                    return this.ECdouble(a);
                }

                throw new Error("EC point addition results in the point at infinity!");

            }

            const LamAdd  = this.modulo((b[1]-a[1])*( this.modInv( b[0]-a[0] ) ), this.Pcurve);
            const x       = this.modulo((LamAdd*LamAdd)-a[0]-b[0], this.Pcurve);
            const y       = this.modulo((LamAdd*( a[0]-x )-a[1]),  this.Pcurve);

            return [x, y];

        }

        throw new Error("Invalid EC Point Addition!");

    }

    public ECdouble(a: Array<bigint>) : Array<bigint>
    {

        if (a[0] != undefined &&
            a[1] != undefined)
        {

            const Lam  = this.modulo((((a[0]*a[0])*this.Three) + this.Acurve)*( this.modInv( a[1]*this.Two )), this.Pcurve);
            const x    = this.modulo((Lam*Lam)-(a[0]*this.Two),  this.Pcurve);
            const y    = this.modulo( Lam*( a[0]-x )-a[1],       this.Pcurve);

            return [x, y];

        }

        throw new Error("Invalid EC Point Doubling!");

    }

    public ECmultiply(GenPoint:   Array<bigint>,
                      ScalarHex:  bigint) : Array<bigint>
    {

        if (ScalarHex == this.Zero || ScalarHex >= this.N)
             throw new Error("Invalid Scalar/Private Key");

        const ScalarBinary = ScalarHex.toString(2);
        let Q            = GenPoint;

        for (let i = 1; i < ScalarBinary.length; i++) {

            Q = this.ECdouble(Q);

            if (ScalarBinary[i] === "1") {
                Q = this.ECadd(Q, GenPoint);
            }

        }

        return Q;

    }

    // uncompressed is the accumulation of both the x and y points
    // compressed is the public key to share in transactions
    // address is the public address tho whom someone can send coin
    public PublicKeyGenerate(PrivateKey: string | number | bigint)
        : {
              x:             bigint,
              y:             bigint,
              xy:            Array<string>,
              uncompressed:  string,
              compressed:    string,
              address:       string
          } |
          undefined
    {

        if (typeof PrivateKey === 'number')
            PrivateKey = BigInt(PrivateKey);

        if (typeof PrivateKey === 'string')
            PrivateKey = BigInt(PrivateKey);

        const publicKey = this.ECmultiply(this.GPoint, PrivateKey);

        if (publicKey[0] !== undefined &&
            publicKey[1] !== undefined)
        {

            const Px = this.zfill(publicKey[0].toString(16));
            const Py = this.zfill(publicKey[1].toString(16));

            return {
                x:             publicKey[0],
                y:             publicKey[1],
                xy:            [Px, Py],
                uncompressed:  publicKey[0].toString(16) + publicKey[1].toString(16),
                compressed:    "04" + Px + Py,
                address:       (this.modulo(publicKey[1], this.Two) == this.One)
                                      ? "03" + Px
                                      : "02" + Px
            };

        }

        return undefined;

    }

}
