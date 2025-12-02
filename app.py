# app.py

import os
import json
from flask import Flask, render_template, jsonify, request, redirect, url_for
from werkzeug.utils import secure_filename

# Flaskアプリケーションのインスタンスを作成
app = Flask(__name__)

# --- 設定 ---
# 問題データファイルのパス
QUESTIONS_FILE = 'questions.json'
# 画像アップロード先フォルダ
UPLOAD_FOLDER = 'static/images'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- データ管理関数 ---

def load_questions():
    """questions.jsonから問題データを読み込む"""
    if not os.path.exists(QUESTIONS_FILE):
        return []
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return [] # ファイルが空か不正な場合は空リストを返す

def save_questions(questions):
    """問題データをquestions.jsonに保存する"""
    with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=4, ensure_ascii=False)

# --- クイズプレイヤー向けAPI ---

@app.route('/')
def index():
    """クイズのメインページを表示"""
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    """公開中の問題数と総問題数を返す"""
    questions = load_questions()
    # is_publicがTrueの問題の数をカウント
    public_questions_count = len([q for q in questions if q.get("is_public", False)])
    return jsonify({
        "unlocked_question": public_questions_count, # unlocked_questionというキー名はJS側との互換性のため維持
        "total_questions": len(questions)
    })

@app.route('/api/status/all_questions', methods=['GET'])
def get_all_questions_status():
    """全ての問題のIDと公開状態をリストで返す (JSが問題リストを生成するために使用)"""
    questions = load_questions()
    simplified_questions = [{"id": q["id"], "is_public": q.get("is_public", False)} for q in questions]
    return jsonify({"questions": simplified_questions})

@app.route('/api/question/<int:q_id>', methods=['GET'])
def get_question(q_id):
    """指定されたIDの問題データを返す"""
    questions = load_questions()
    question_data = next((q for q in questions if q["id"] == q_id), None)

    if not question_data:
        return jsonify({"error": "Question not found."}), 404

    # 公開されていない問題へのアクセスは拒否
    if not question_data.get("is_public", False):
        return jsonify({"error": "This question is not public yet."}), 403

    # 正解の情報は含めずに返す
    return jsonify({
        "question": question_data["question"],
        "options": question_data["options"],
        "image": question_data.get("image")
    })

@app.route('/api/answer', methods=['POST'])
def check_answer():
    """回答の正誤を判定する"""
    data = request.json
    q_id = data.get('q_id')
    user_answer = data.get('answer')
    
    questions = load_questions()
    question_data = next((q for q in questions if q["id"] == q_id), None)

    if not question_data:
        return jsonify({"error": "Question not found."}), 404

    # 公開されていない問題への回答は受け付けない
    if not question_data.get("is_public", False):
        return jsonify({"error": "This question is not public yet."}), 403

    is_correct = (question_data["answer"] == user_answer)
    return jsonify({"correct": is_correct})


# --- 管理者向けページ ---

@app.route('/admin')
def admin_page():
    """管理画面のトップページ。問題一覧を表示する。"""
    questions = load_questions()
    # ID順にソートして表示
    questions.sort(key=lambda x: x['id'])
    return render_template('admin.html', questions=questions)

@app.route('/admin/add', methods=['GET', 'POST'])
def add_question():
    """新しい問題を追加するページと処理"""
    if request.method == 'POST':
        questions = load_questions()
        
        new_id = max([q['id'] for q in questions] + [0]) + 1
        
        new_question = {
            "id": new_id,
            "question": request.form['question'],
            "options": [
                request.form['option1'],
                request.form['option2'],
                request.form['option3']
            ],
            "answer": request.form['answer'],
            "image": None,
            "is_public": 'is_public' in request.form # チェックボックスの状態を反映
        }

        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                filename = secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                new_question['image'] = filename
        
        questions.append(new_question)
        save_questions(questions)
        return redirect(url_for('admin_page'))
        
    return render_template('edit_question.html', question=None, title="問題の新規追加")

@app.route('/admin/edit/<int:q_id>', methods=['GET', 'POST'])
def edit_question(q_id):
    """既存の問題を編集するページと処理"""
    questions = load_questions()
    question_data = next((q for q in questions if q["id"] == q_id), None)
    if not question_data:
        return "Question not found", 404

    if request.method == 'POST':
        question_data['question'] = request.form['question']
        question_data['options'] = [
            request.form['option1'],
            request.form['option2'],
            request.form['option3']
        ]
        question_data['answer'] = request.form['answer']
        question_data['is_public'] = 'is_public' in request.form
        
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                filename = secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                question_data['image'] = filename

        save_questions(questions)
        return redirect(url_for('admin_page'))

    return render_template('edit_question.html', question=question_data, title="問題の編集")

@app.route('/admin/delete/<int:q_id>', methods=['POST'])
def delete_question(q_id):
    """問題を削除する処理"""
    questions = load_questions()
    questions_to_keep = [q for q in questions if q['id'] != q_id]
    save_questions(questions_to_keep)
    return redirect(url_for('admin_page'))

@app.route('/admin/toggle_public/<int:q_id>', methods=['POST'])
def toggle_public(q_id):
    """問題の公開/非公開を切り替えるAPI"""
    questions = load_questions()
    target_question = None
    for q in questions:
        if q['id'] == q_id:
            q['is_public'] = not q.get('is_public', False)
            target_question = q
            break
            
    if target_question:
        save_questions(questions)
        return jsonify({"success": True, "is_public": target_question['is_public']})
    else:
        return jsonify({"success": False, "error": "Question not found"}), 404

# --- アプリケーションの実行 ---
if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(host='0.0.0.0', port=5001, debug=True)