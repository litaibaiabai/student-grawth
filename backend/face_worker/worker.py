"""Local-only face verification. Never log frames, descriptors, or images."""
import base64, hashlib, io, json, os, sys
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
import cv2 as cv
import numpy as np
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
root=sys.argv[1]
with open(os.path.join(root,'manifest.json'),encoding='utf8') as f: manifest=json.load(f)
for entry in manifest.values():
    with open(os.path.join(root,entry['file']),'rb') as f:
        if hashlib.sha256(f.read()).hexdigest()!=entry['sha256']: raise RuntimeError('Invalid model hash')
detector=cv.FaceDetectorYN.create(os.path.join(root,manifest['yunet']['file']),'',(640,480),score_threshold=.9,nms_threshold=.3)
recognizer=cv.FaceRecognizerSF.create(os.path.join(root,manifest['sface']['file']),'')
landmarker=vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=os.path.join(root,manifest['landmarker']['file'])),running_mode=vision.RunningMode.IMAGE,num_faces=2,output_face_blendshapes=True))
print(json.dumps({'ready':True}),flush=True)
def infer(frames,action):
    if action not in ('BLINK','TURN') or not 8<=len(frames)<=32: raise ValueError('请重新开始采集')
    features=[]; phase=0
    for value in frames:
        data=base64.b64decode(value.split(',',1)[1],validate=True)
        if len(data)>524288: raise ValueError('图像过大')
        with Image.open(io.BytesIO(data)) as im:
            if im.format!='JPEG' or min(im.size)<128 or max(im.size)>640: raise ValueError('图像尺寸不符合要求')
        image=cv.imdecode(np.frombuffer(data,np.uint8),cv.IMREAD_COLOR)
        if image is None: raise ValueError('图像无法读取')
        h,w=image.shape[:2]; detector.setInputSize((w,h)); _,faces=detector.detect(image)
        if faces is None: raise ValueError('未检测到人脸，请正对摄像头')
        if len(faces)!=1: raise ValueError('画面中只能有一张人脸')
        face=faces[0];x,y,fw,fh=face[:4]
        if min(fw,fh)<100: raise ValueError('请靠近摄像头')
        roi=image[max(0,int(y)):min(h,int(y+fh)),max(0,int(x)):min(w,int(x+fw))]
        if not roi.size: raise ValueError('请将脸移入取景框')
        gray=cv.cvtColor(roi,cv.COLOR_BGR2GRAY)
        if gray.mean()<55 or gray.mean()>235: raise ValueError('光照不足或过强，请调整光线')
        if cv.Laplacian(gray,cv.CV_64F).var()<35: raise ValueError('画面模糊，请保持稳定')
        result=landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv.cvtColor(image,cv.COLOR_BGR2RGB)))
        if len(result.face_landmarks)!=1: raise ValueError('请保持单人清晰面部画面')
        points=result.face_landmarks[0]; yaw=(points[1].x-(points[33].x+points[263].x)/2)/max(.01,abs(points[33].x-points[263].x))
        blink={c.category_name:c.score for c in result.face_blendshapes[0]}
        closed=min(blink.get('eyeBlinkLeft',0),blink.get('eyeBlinkRight',0))>.55
        opened=max(blink.get('eyeBlinkLeft',1),blink.get('eyeBlinkRight',1))<.3
        center=abs(yaw)<.12
        targets=[center,yaw<-.16,yaw>.16,center] if action=='TURN' else [center and opened,closed,center and opened]
        if phase<len(targets) and targets[phase]: phase+=1
        feature=recognizer.feature(recognizer.alignCrop(image,face)).flatten().astype(float)
        feature/=max(np.linalg.norm(feature),1e-9)
        if features and float(np.dot(features[0],feature))<.65: raise ValueError('请由同一人连续完成采集')
        features.append(feature)
    if phase<(4 if action=='TURN' else 3): raise ValueError('动作未完成，请实时按提示转头或眨眼')
    feature=np.mean(features,axis=0); feature/=max(np.linalg.norm(feature),1e-9)
    return {'modelVersion':'sface-2021dec','descriptor':feature.tolist()}
while True:
    line=sys.stdin.readline(6*1024*1024+1)
    if not line: break
    request=None
    try:
        if len(line)>6*1024*1024: raise ValueError('采集数据过大')
        request=json.loads(line)
        response={'id':request['id'],'result':infer(request['frames'],request['action'])}
    except ValueError as e: response={'id':request.get('id') if isinstance(request,dict) else None,'error':str(e) if str(e) in ('未检测到人脸，请正对摄像头','画面中只能有一张人脸','请靠近摄像头','请将脸移入取景框','光照不足或过强，请调整光线','画面模糊，请保持稳定','请保持单人清晰面部画面','请由同一人连续完成采集','动作未完成，请实时按提示转头或眨眼','图像尺寸不符合要求') else '面部采集无效，请重试'}
    except Exception: response={'id':request.get('id') if isinstance(request,dict) else None,'error':'人脸验证暂不可用，请使用密码登录'}
    print(json.dumps(response,separators=(',',':')),flush=True)
    request=None; response=None; line=None
