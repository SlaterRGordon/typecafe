file1 = open('english10k.txt', 'r')
lines = file1.readlines()
stringLines = []
for line in lines:
    stringLines.append('\"' + line.strip() + '\"')

newLines = "const english10k = [" + ", ".join(stringLines) + "]"

file2 = open('english10kk.txt', 'w')
file2.writelines(newLines)
file2.close()
    
