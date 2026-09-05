// Procedural skins: per-species GLSL evaluated in bind-pose 3D space (seamless across parts) and baked
// into the UV atlas via the position/info maps (albedo sRGB, height → normal, ORM). Plus the runtime
// material: MeshStandardMaterial with instanced skinning injected through onBeforeCompile — every
// instance reads its own bone matrices from a shared float texture (row = aSlot), so one draw call
// renders every animal of a species. A matching MeshDepthMaterial keeps shadows animated.
import * as THREE from 'three';

const PRELUDE = /* glsl */ `
#define ON(p,id) step(abs((p)-(id)),0.5)
vec3 hash33(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
// 3D worley: (d1, d2, cell id)
vec3 worley3(vec3 p, float seed){
  vec3 i=floor(p); vec3 f=p-i; float d1=8.0,d2=8.0,id=0.0;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=vec3(float(x),float(y),float(z)); vec3 h=hash33(i+g+seed); vec3 r=g+h-f; float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;id=hash33(i+g+seed*1.7+9.0).x;} else if(d<d2){d2=d;}
  }
  return vec3(sqrt(d1),sqrt(d2),id);
}
// fine hair grain elongated along the body axis
float furH(vec3 P, float scale){ vec3 q=P*scale; return snoise(vec3(q.x*260.0,q.y*260.0,q.z*50.0))*0.6+snoise(vec3(q.x*110.0,q.y*45.0,q.z*110.0)+3.0)*0.4; }
float eyeMask(vec3 P){ float d=min(distance(P,uEyeL),distance(P,uEyeR)); return 1.0-smoothstep(uEyeRad*0.8,uEyeRad*1.15,d); }
float eyeRing(vec3 P){ float d=min(distance(P,uEyeL),distance(P,uEyeR)); return 1.0-smoothstep(uEyeRad*1.1,uEyeRad*2.2,d); }
float belly(float v){ return 1.0-smoothstep(0.24,0.44,abs(v-0.5)); }
float ridge(float v, float w){ float a=min(v,1.0-v); return 1.0-smoothstep(w*0.5,w,a); }
// Every colour below is TRUE LINEAR albedo. core/Textures.js gpu(srgb:true) does the single sRGB
// encode on write, so do not encode, darken or saturate here (see CLAUDE.md "Colour authoring").
float cracks(vec3 P, float f){
  // domain-warp before the ridged sample so wrinkle cells vary in size and are not a uniform "golf
  // ball" dimple grid; the warp frequency is well below f so it bends whole wrinkle clusters, not
  // individual wrinkles.
  vec3 w = P + 0.4 * vec3(snoise(P*f*0.3+11.0), snoise(P*f*0.3+23.0), snoise(P*f*0.3+37.0));
  float a=1.0-abs(snoise(w*f)); float b=1.0-abs(snoise(w*f*2.3+5.0));
  return pow(a,5.0)*0.7+pow(b,6.0)*0.4;
}
`;

// Each species: void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough)
// parts: 1 torso 2 neck 3 head 4 ear 5 foreleg 6 hindleg 7 tail 8 tusk 9 horn 10 trunk 11 mane 12 ossicone 13 wing 14 beard
const SKINS = {
  zebra: { size: 1024, normal: 0.0034, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float n1=snoise(P*3.0+uSeed), n2=snoise(P*9.0+3.1);
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), neck=ON(part,2.0), tail=ON(part,7.0), ear=ON(part,4.0);
  float rump=smoothstep(-0.15,-0.85,P.z);
  float qT=P.z*11.0+P.y*mix(0.0,7.5,rump)+0.55*n1+0.12*n2;
  float qN=(P.z*0.55-P.y*0.85)*13.0+0.4*n1;
  float qH=(P.z*0.35-P.y)*17.0+0.3*n1;
  float qL=P.y*19.0+0.25*n1+0.08*n2;
  float q=leg>0.5?qL:head>0.5?qH:neck>0.5?qN:qT;
  float width=0.45+0.1*n2;
  float st=smoothstep(-0.14,0.14,sin(q*6.2831)+(width-0.5)*2.0);
  float bel=belly(v)*(1.0-leg)*(1.0-head)*(1.0-tail);
  st=max(st,bel*0.9);
  float muzzle=head*smoothstep(0.78,0.9,s);
  float hoof=leg*smoothstep(0.93,0.96,s);
  float tuft=tail*smoothstep(0.5,0.65,s);
  float earTip=ear*smoothstep(0.75,0.9,s);
  st=st*(1.0-muzzle)*(1.0-hoof)*(1.0-tuft)*(1.0-earTip*0.9);
  vec3 white=vec3(0.55,0.53,0.475)*(0.93+0.09*n2);
  vec3 black=vec3(0.035,0.031,0.029);
  alb=mix(black,white,st);
  alb=mix(alb,vec3(0.33,0.29,0.23),0.2*leg*smoothstep(0.35,1.0,s));
  float eye=eyeMask(P);
  alb=mix(alb,alb*0.6,eyeRing(P)*0.5);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.2*furH(P,1.0)+0.05*(st-0.5);
  rough=mix(0.72,0.6,st); rough=mix(rough,0.5,hoof); rough=mix(rough,0.12,eye);
}` },

  giraffe: { size: 1024, normal: 0.0034, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), neck=ON(part,2.0), tail=ON(part,7.0), oss=ON(part,12.0), ear=ON(part,4.0);
  float scale=head>0.5?9.0:leg>0.5?6.5:4.3;
  vec3 warp=0.3*vec3(snoise(P*2.5),snoise(P*2.5+7.0),snoise(P*2.5+13.0));
  vec3 w=worley3(P*scale+warp,uSeed);
  float edge=w.y-w.x;
  float blot=smoothstep(0.05,0.16,edge);
  float lowerLeg=leg*smoothstep(0.42,0.6,s);
  float bel=belly(v)*(1.0-leg)*(1.0-head);
  blot*=(1.0-lowerLeg)*(1.0-bel*0.92)*(1.0-tail)*(1.0-oss);
  vec3 cream=vec3(0.50,0.455,0.35)*(0.94+0.08*snoise(P*12.0));
  vec3 brown=mix(vec3(0.30,0.155,0.055),vec3(0.16,0.075,0.028),w.z*0.6+0.25*snoise(P*25.0));
  brown=mix(brown,brown*0.55,smoothstep(0.3,0.6,edge));
  alb=mix(cream,brown,blot);
  float mane=neck*ridge(v,0.08)+head*ridge(v,0.06)*smoothstep(0.3,0.05,s);
  alb=mix(alb,vec3(0.28,0.16,0.07),mane);
  alb=mix(alb,vec3(0.32,0.2,0.1),oss*(1.0-smoothstep(0.7,0.85,s)));
  alb=mix(alb,vec3(0.06,0.05,0.04),oss*smoothstep(0.75,0.9,s));
  alb=mix(alb,vec3(0.08,0.06,0.05),tail*smoothstep(0.55,0.7,s));
  alb=mix(alb,vec3(0.35,0.3,0.24),leg*smoothstep(0.93,0.96,s));
  alb=mix(alb,vec3(0.3,0.2,0.1),head*smoothstep(0.88,0.96,s));
  alb=mix(alb,vec3(0.2,0.12,0.06),ear*smoothstep(0.7,0.9,s)*0.6);
  float eye=eyeMask(P);
  alb=mix(alb,alb*0.55,eyeRing(P)*0.6);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.2*furH(P,1.0)+0.06*blot;
  rough=mix(0.72,0.66,blot); rough=mix(rough,0.12,eye);
}` },

  cheetah: { size: 1024, normal: 0.0034, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), tail=ON(part,7.0), ear=ON(part,4.0);
  float scale=head>0.5?40.0:26.0;
  vec3 w=worley3(P*scale,uSeed);
  float spot=(1.0-smoothstep(0.22,0.33,w.x))*step(0.3,w.z);
  float bel=belly(v)*(1.0-leg)*(1.0-head)*(1.0-tail);
  spot*=(1.0-bel);
  vec3 base=mix(vec3(0.45,0.325,0.16),vec3(0.58,0.53,0.44),bel)*(0.94+0.1*snoise(P*10.0));
  base=mix(base,vec3(0.55,0.49,0.39),head*smoothstep(0.55,0.8,s)*belly(v));
  vec3 e=P.x<0.0?uEyeL:uEyeR; float dz=P.z-e.z;
  float tear=smoothstep(0.014,0.004,abs(P.y-(e.y-dz*1.5)))*smoothstep(0.02,0.006,abs(abs(P.x)-abs(e.x)*(1.0-dz*1.6)))*step(0.0,dz)*step(dz,0.13)*head;
  float rings=tail*smoothstep(0.55,0.7,s)*smoothstep(0.2,0.6,sin(s*70.0));
  float tip=tail*smoothstep(0.93,0.96,s);
  alb=mix(base,vec3(0.06,0.05,0.04),max(max(spot,tear),rings*0.9));
  alb=mix(alb,vec3(0.56,0.53,0.47),tip);
  alb=mix(alb,vec3(0.08,0.06,0.05),ear*smoothstep(0.4,0.8,s)*step(0.5,abs(v-0.5)+0.25)*0.8);
  alb=mix(alb,vec3(0.06),head*smoothstep(0.95,0.99,s));
  alb=mix(alb,vec3(0.3,0.22,0.15),leg*smoothstep(0.94,0.97,s));
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.5,0.35,0.15),eyeRing(P)*0.4);
  alb=mix(alb,vec3(0.03),eye);
  h=0.5+0.22*furH(P,1.2)+0.05*spot;
  rough=0.7; rough=mix(rough,0.12,eye);
}` },

  lion: { size: 1024, normal: 0.0042, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), tail=ON(part,7.0), ear=ON(part,4.0), mane=ON(part,11.0);
  vec3 tawny=vec3(0.38,0.275,0.145)*(0.92+0.12*snoise(P*6.0)+0.05*snoise(P*30.0));
  float bel=belly(v)*(1.0-leg)*(1.0-head)*(1.0-tail)*(1.0-mane);
  alb=mix(tawny,vec3(0.52,0.46,0.37),bel*0.8);
  float strands=snoise(vec3(P.x*40.0,P.y*60.0,P.z*40.0))*0.5+0.5;
  vec3 maneCol=mix(vec3(0.28,0.16,0.06),vec3(0.58,0.38,0.16),strands*0.7+0.3*snoise(P*4.0));
  alb=mix(alb,maneCol,mane);
  alb=mix(alb,vec3(0.06,0.05,0.04),tail*smoothstep(0.86,0.9,s));
  alb=mix(alb,vec3(0.08,0.06,0.05),ear*step(0.25,abs(v-0.5))*smoothstep(0.35,0.7,s)*0.85);
  alb=mix(alb,vec3(0.56,0.52,0.44),head*smoothstep(0.62,0.85,s)*smoothstep(0.15,0.35,abs(v-0.5))*0.8);
  alb=mix(alb,vec3(0.05,0.04,0.04),head*smoothstep(0.95,0.99,s));
  alb=mix(alb,vec3(0.4,0.3,0.2),leg*smoothstep(0.95,0.98,s));
  float eye=eyeMask(P);
  alb=mix(alb,alb*0.6,eyeRing(P)*0.5);
  alb=mix(alb,vec3(0.03),eye);
  h=0.5+0.2*furH(P,1.0)+mane*0.25*(strands-0.5);
  rough=0.74; rough=mix(rough,0.12,eye);
}` },

  elephant: { size: 1024, normal: 0.011, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), tail=ON(part,7.0), ear=ON(part,4.0), tusk=ON(part,8.0), trunk=ON(part,10.0);
  // sRGB reflectance: real elephant hide is ~0.26-0.34, dust-reddened on the back and flanks.
  vec3 grey=vec3(0.30,0.288,0.278)*(0.94+0.10*snoise(P*15.0));
  grey=mix(grey,grey*0.86,smoothstep(0.2,0.75,fbm(P*2.6,3))*0.6);
  float dust=smoothstep(-0.25,0.65,fbm(P*1.1,3))*(0.35+0.65*(1.0-belly(v)));
  dust*=0.55+0.45*smoothstep(-0.35,0.5,P.y);
  alb=mix(grey,vec3(0.40,0.325,0.255),dust*0.62);
  // ~2.5 cm wrinkles: fine enough to read as hide, coarse enough to survive the atlas texel size
  float wr=cracks(P,42.0)*0.9+cracks(P,88.0)*0.35;
  float folds=pow(0.5+0.5*sin(P.y*58.0+1.2*snoise(P*7.0)),4.0)*leg*0.7+pow(0.5+0.5*sin(s*250.0),5.0)*trunk*0.9;
  float mid=pow(1.0-abs(snoise(P*16.0)),5.0)*0.5;
  float creases=pow(0.5+0.5*sin(P.z*7.0+2.2*snoise(P*2.0)),10.0)*0.45*(1.0-leg)*(1.0-trunk);
  float groove=clamp(wr+folds*0.7+mid+creases*0.6,0.0,1.0)*(1.0-tusk);
  alb*=1.0-0.16*groove;
  alb=mix(alb,alb*0.82,ear*smoothstep(0.7,1.0,s));
  alb=mix(alb,vec3(0.78,0.73,0.60)*(0.96+0.04*snoise(P*40.0)),tusk);
  alb=mix(alb,vec3(0.46,0.42,0.35),leg*smoothstep(0.965,0.985,s)*step(0.42,abs(v-0.5)+0.2));
  alb=mix(alb,vec3(0.09,0.075,0.065),tail*smoothstep(0.78,0.86,s));
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.22,0.18,0.15),eyeRing(P)*0.6);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5-0.30*groove+0.04*snoise(P*120.0);
  h=mix(h,0.5+0.02*snoise(P*60.0),tusk);
  rough=0.92-0.10*dust; rough=mix(rough,0.4,tusk); rough=mix(rough,0.15,eye);
}` },

  rhino: { size: 1024, normal: 0.0098, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), horn=ON(part,9.0), ear=ON(part,4.0), tail=ON(part,7.0);
  vec3 grey=vec3(0.36,0.345,0.325)*(0.92+0.12*snoise(P*12.0));
  float mud=smoothstep(-0.2,0.6,fbm(P*1.5,3))*(0.3+0.7*belly(v));
  alb=mix(grey,vec3(0.34,0.285,0.225),mud*0.55);
  float fold=exp(-pow((P.z-0.95)*5.0,2.0))+exp(-pow((P.z+0.85)*5.0,2.0));
  fold*=ON(part,1.0)*(1.0-smoothstep(0.2,0.45,abs(v-0.5)));
  float wr=cracks(P,40.0)*0.6+cracks(P,80.0)*0.25+pow(0.5+0.5*sin(P.y*66.0),6.0)*leg*0.4;
  float groove=clamp(wr+fold*0.6,0.0,1.0)*(1.0-horn);
  alb*=1.0-0.12*groove;
  vec3 hornCol=mix(vec3(0.42,0.37,0.3),vec3(0.62,0.56,0.45),smoothstep(0.5,1.0,s))*(0.9+0.15*snoise(vec3(P.x*50.0,P.y*8.0,P.z*50.0)));
  alb=mix(alb,hornCol,horn);
  alb=mix(alb,vec3(0.2,0.17,0.15),tail*smoothstep(0.65,0.8,s)*0.7);
  alb=mix(alb,vec3(0.3,0.27,0.25),leg*smoothstep(0.96,0.985,s));
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5-0.26*groove+0.035*snoise(P*110.0);
  h=mix(h,0.5+0.1*snoise(vec3(P.x*60.0,P.y*6.0,P.z*60.0)),horn);
  rough=0.88-0.1*mud; rough=mix(rough,0.55,horn); rough=mix(rough,0.15,eye);
}` },

  hippo: { size: 1024, normal: 0.006, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), ear=ON(part,4.0);
  vec3 top=vec3(0.275,0.25,0.285)*(0.93+0.09*snoise(P*8.0));
  vec3 pink=vec3(0.52,0.32,0.31)*(0.95+0.07*snoise(P*20.0));
  float lower=belly(v)*(1.0-leg);
  float muzzle=head*smoothstep(0.55,0.85,s)*smoothstep(0.55,0.25,abs(v-0.5));
  float k=clamp(lower*0.75+eyeRing(P)*0.7+muzzle*0.6+ear*0.4,0.0,1.0);
  alb=mix(top,pink,k);
  float wr=cracks(P,30.0)*0.35;
  alb*=1.0-0.2*wr;
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5-0.14*wr+0.03*snoise(P*90.0);
  float wet=1.0-smoothstep(0.12,0.42,abs(v-0.5));
  rough=mix(0.62,0.3,wet); rough=mix(rough,0.1,eye);
}` },

  buffalo: { size: 1024, normal: 0.0042, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), horn=ON(part,9.0), ear=ON(part,4.0);
  vec3 dark=vec3(0.055,0.047,0.040); vec3 hair=vec3(0.125,0.098,0.072);
  float sparse=smoothstep(0.2,0.9,snoise(P*45.0))*0.5+(fbm(P*7.0,3)*0.5+0.5)*0.35;
  alb=mix(dark,hair,sparse);
  alb=mix(alb,vec3(0.32,0.3,0.27),0.35*smoothstep(0.2,0.7,fbm(P*2.0+3.0,3))*(head+leg*0.5));
  alb=mix(alb,vec3(0.3,0.28,0.26),head*smoothstep(0.85,0.95,s));
  vec3 hornCol=mix(vec3(0.2,0.18,0.16),vec3(0.5,0.44,0.34),smoothstep(0.25,0.9,s))*(0.9+0.15*snoise(vec3(P.x*40.0,P.y*40.0,P.z*40.0)));
  alb=mix(alb,hornCol,horn);
  alb=mix(alb,vec3(0.2,0.16,0.12),ear*step(0.25,abs(v-0.5)));
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.22*furH(P,1.0);
  h=mix(h,0.5+0.2*sin(s*90.0)*(1.0-smoothstep(0.5,0.9,s))+0.05*snoise(P*50.0),horn);
  rough=0.8; rough=mix(rough,0.55,horn); rough=mix(rough,0.15,eye);
}` },

  wildebeest: { size: 1024, normal: 0.0042, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), neck=ON(part,2.0), tail=ON(part,7.0), horn=ON(part,9.0), beard=ON(part,14.0), ear=ON(part,4.0);
  vec3 base=vec3(0.185,0.158,0.132)*(0.91+0.14*snoise(P*10.0));
  float region=smoothstep(-0.35,0.25,P.z)*(1.0-belly(v))*(ON(part,1.0)+neck);
  float stripes=smoothstep(0.15,0.6,sin(P.z*40.0+1.6*snoise(P*4.0)));
  alb=mix(base,base*0.5,stripes*region*0.75);
  alb=mix(alb,vec3(0.12,0.1,0.09),head*smoothstep(0.25,0.55,s));
  float mane=neck*ridge(v,0.14)+head*ridge(v,0.1)*smoothstep(0.35,0.1,s);
  alb=mix(alb,vec3(0.07,0.06,0.05),max(mane,beard));
  alb=mix(alb,vec3(0.07,0.06,0.05),tail*smoothstep(0.28,0.4,s));
  alb=mix(alb,vec3(0.5,0.42,0.33),leg*0.45*smoothstep(0.3,0.7,s));
  vec3 hornCol=mix(vec3(0.18,0.16,0.14),vec3(0.42,0.36,0.28),smoothstep(0.4,1.0,s));
  alb=mix(alb,hornCol,horn);
  alb=mix(alb,vec3(0.15,0.12,0.1),ear*step(0.25,abs(v-0.5))*0.7);
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.22*furH(P,1.0)+mane*0.2*snoise(P*80.0);
  h=mix(h,0.5+0.15*sin(s*80.0)*(1.0-smoothstep(0.4,0.8,s)),horn);
  rough=0.78; rough=mix(rough,0.55,horn); rough=mix(rough,0.15,eye);
}` },

  warthog: { size: 512, normal: 0.012, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), head=ON(part,3.0), neck=ON(part,2.0), tail=ON(part,7.0), tusk=ON(part,8.0);
  vec3 skin=vec3(0.335,0.29,0.245)*(0.88+0.18*snoise(P*14.0));
  float bristle=smoothstep(0.3,0.9,snoise(P*70.0))*0.5;
  alb=mix(skin,vec3(0.2,0.16,0.13),bristle*(1.0-belly(v)));
  alb=mix(alb,vec3(0.32,0.27,0.22),head*smoothstep(0.3,0.7,s));
  float mane=neck*ridge(v,0.3)+ON(part,1.0)*ridge(v,0.12)*smoothstep(-0.2,0.3,P.z)+head*ridge(v,0.2)*smoothstep(0.4,0.1,s);
  alb=mix(alb,vec3(0.14,0.11,0.09),mane);
  alb=mix(alb,vec3(0.80,0.75,0.62),tusk);
  alb=mix(alb,vec3(0.1,0.08,0.07),tail*smoothstep(0.78,0.85,s));
  alb=mix(alb,vec3(0.25,0.2,0.16),leg*smoothstep(0.9,0.96,s));
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.09*snoise(P*70.0)-0.12*cracks(P,52.0)+0.15*bristle*snoise(vec3(P.x*200.0,P.y*200.0,P.z*40.0));
  rough=0.85; rough=mix(rough,0.35,tusk); rough=mix(rough,0.15,eye);
}` },

  ostrich: { size: 1024, normal: 0.0055, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float body=ON(part,1.0), tail=ON(part,7.0), wing=ON(part,13.0), neck=ON(part,2.0), head=ON(part,3.0), leg=ON(part,6.0);
  float feather=body+tail+wing;
  float barbs=snoise(vec3(P.x*90.0,P.y*30.0,P.z*90.0))*0.5+0.5;
  vec3 black=mix(vec3(0.05,0.045,0.04),vec3(0.12,0.1,0.09),barbs*0.5+0.3*snoise(P*6.0));
  vec3 white=vec3(0.52,0.51,0.475)*(0.9+0.1*barbs);
  float whiteK=wing*smoothstep(0.5,0.75,s)+tail*smoothstep(0.35,0.6,s);
  alb=mix(black,white,whiteK);
  float bareTop=body*(1.0-smoothstep(0.02,0.12,abs(v-0.5)));
  vec3 skinC=vec3(0.72,0.56,0.5)*(0.9+0.12*snoise(P*25.0));
  vec3 legC=vec3(0.58,0.46,0.42)*(0.9+0.12*snoise(P*30.0));
  alb=mix(alb,skinC,neck+head);
  alb=mix(alb,legC,leg);
  alb=mix(alb,vec3(0.32,0.27,0.24),leg*smoothstep(0.85,0.95,s));
  alb=mix(alb,vec3(0.35,0.3,0.28),head*smoothstep(0.7,0.95,s));
  alb=mix(alb,vec3(0.25,0.2,0.18),neck*pow(0.5+0.5*snoise(vec3(P.x*8.0,P.y*8.0,P.z*8.0)),4.0)*0.5);
  float eye=eyeMask(P);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+feather*(0.3*barbs-0.15+0.1*snoise(P*15.0))+(neck+head+leg)*0.04*snoise(P*80.0);
  rough=mix(0.72,0.85,feather); rough=mix(rough,0.15,eye);
}` },

  impala: { size: 1024, normal: 0.0034, glsl: /* glsl */ `
void skin(vec3 P, float part, float s, float v, float r, out vec3 alb, out float h, out float rough){
  float leg=ON(part,5.0)+ON(part,6.0), hind=ON(part,6.0), head=ON(part,3.0), tail=ON(part,7.0), horn=ON(part,9.0), ear=ON(part,4.0), neck=ON(part,2.0), torso=ON(part,1.0);
  vec3 back=vec3(0.24,0.115,0.038), side=vec3(0.40,0.255,0.125), white=vec3(0.55,0.53,0.485);
  float t=abs(v-0.5);
  float n=0.94+0.1*snoise(P*12.0);
  alb=mix(white,side,smoothstep(0.1,0.24,t))*n;
  alb=mix(alb,back*n,smoothstep(0.3,0.46,t)*(torso+neck+head*0.6));
  alb=mix(alb,side*n,leg);
  alb=mix(alb,white,leg*smoothstep(0.45,0.7,s)*0.4);
  float rumpStripe=torso*step(P.z,-0.5)*smoothstep(0.035,0.012,abs(abs(P.x)-0.1))*(1.0-belly(v));
  float tailLine=tail*ridge(v,0.2);
  float fetlock=hind*smoothstep(0.78,0.85,s)*(1.0-smoothstep(0.88,0.92,s));
  alb=mix(alb,vec3(0.06,0.05,0.04),max(max(rumpStripe,tailLine),fetlock));
  alb=mix(alb,vec3(0.06,0.05,0.04),ear*smoothstep(0.78,0.9,s));
  alb=mix(alb,white,head*smoothstep(0.6,0.85,s)*smoothstep(0.35,0.2,t)*0.8);
  alb=mix(alb,vec3(0.05),head*smoothstep(0.95,0.99,s));
  vec3 hornCol=vec3(0.22,0.18,0.14)*(0.9+0.2*snoise(P*30.0));
  alb=mix(alb,hornCol,horn);
  alb=mix(alb,vec3(0.25,0.2,0.16),leg*smoothstep(0.94,0.97,s));
  float eye=eyeMask(P);
  alb=mix(alb,alb*0.6,eyeRing(P)*0.5);
  alb=mix(alb,vec3(0.02),eye);
  h=0.5+0.2*furH(P,1.3);
  h=mix(h,0.5+0.3*sin(s*85.0)*(1.0-smoothstep(0.55,0.8,s)),horn);
  rough=0.72; rough=mix(rough,0.5,horn); rough=mix(rough,0.12,eye);
}` },
};

export function skinSize(ctx, spec) {
  const def = SKINS[spec.tex] || SKINS.zebra;
  return ctx.quality === 'low' ? Math.min(def.size, 512) : def.size;
}

/** Bake the four textures for one species variant. maps: {pos, info} DataTextures from bakePositionMaps. */
export function bakeSkin(ctx, spec, variant, maps, eyes, seed) {
  const def = SKINS[spec.tex] || SKINS.zebra;
  const size = skinSize(ctx, spec);
  const key = `animals:${spec.id}:${variant}`;
  const uniforms = { uPos: maps.pos, uInfo: maps.info, uEyeL: eyes.L, uEyeR: eyes.R, uEyeRad: eyes.r };
  const body = PRELUDE + def.glsl;
  const wrap = (out) => `${body}
vec4 shade(vec2 uv){
  vec4 pp = texture(uPos, uv); vec4 inf = texture(uInfo, uv);
  vec3 alb; float h, ro; skin(pp.xyz, pp.w, inf.x, inf.y, inf.z, alb, h, ro);
  if (inf.w < 0.01) { alb = vec3(0.4, 0.35, 0.3); h = 0.5; ro = 0.8; }
  ${out}
}`;
  const T = ctx.textures;
  const height = T.gpu(wrap('return vec4(vec3(clamp(h, 0.0, 1.0)), 1.0);'), { key: key + ':height', size, uniforms, type: THREE.HalfFloatType, mipmaps: false, seed });
  const map = T.gpu(wrap('return vec4(clamp(alb, 0.0, 1.0), 1.0);'), { key: key + ':albedo', size, uniforms, srgb: true, seed });
  const orm = T.gpu(wrap('return vec4(1.0, clamp(ro, 0.05, 1.0), 0.0, 1.0);'), { key: key + ':orm', size, uniforms, seed });
  const normalMap = T.normalFromHeight(height, { key: key + ':normal', size, strength: def.normal });
  return { map, normalMap, ormMap: orm, keys: [key + ':height', key + ':albedo', key + ':orm', key + ':normal'] };
}

const SKIN_VERT = /* glsl */ `#include <common>
attribute vec4 aBoneIndex; attribute vec4 aBoneWeight; attribute float aSlot;
uniform highp sampler2D uBones;
mat4 animBone(float i){ int x = int(i) * 4; int y = int(aSlot + 0.5);
  return mat4(texelFetch(uBones, ivec2(x, y), 0), texelFetch(uBones, ivec2(x + 1, y), 0), texelFetch(uBones, ivec2(x + 2, y), 0), texelFetch(uBones, ivec2(x + 3, y), 0)); }`;

function injectSkinning(material, uBones) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBones = uBones;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', SKIN_VERT)
      .replace('#include <skinbase_vertex>', 'mat4 skinM = aBoneWeight.x * animBone(aBoneIndex.x) + aBoneWeight.y * animBone(aBoneIndex.y);')
      .replace('#include <skinnormal_vertex>', 'objectNormal = (skinM * vec4(objectNormal, 0.0)).xyz;')
      .replace('#include <skinning_vertex>', 'transformed = (skinM * vec4(transformed, 1.0)).xyz;');
  };
  material.customProgramCacheKey = () => 'animals-instanced-skin-v1';
  return material;
}

/** Runtime materials for one pool. uBones = { value: DataTexture } shared with the pool (swapped on growth). */
export function makeMaterials(ctx, tex, uBones) {
  const material = ctx.materials.standard({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.ormMap, metalnessMap: tex.ormMap, aoMap: tex.ormMap,
    roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8),
  });
  injectSkinning(material, uBones);
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  injectSkinning(depthMaterial, uBones);
  return { material, depthMaterial };
}

export const SKIN_IDS = Object.keys(SKINS);
